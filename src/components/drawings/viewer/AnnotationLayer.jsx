/**
 * SVG overlay that renders persisted markup on top of the PDF canvas, and
 * captures pointer input to create new markup.
 *
 * Sits inside the canvas wrapper (`position: relative; display: inline-block`)
 * in DrawingViewer. Sized exactly to the canvas so pointer coords map 1:1
 * to canvas pixels before we convert them to PDF user units via the
 * pdfjs `viewport`.
 *
 * Tools it handles directly (activeTool passed as a prop):
 *   select   — hit-test + delete key removes hovered/selected item
 *   pen      — freehand stroke; mousedown starts, mousemove extends,
 *              mouseup commits (with point simplification)
 *   rect     — click-drag rectangle
 *   arrow    — click-drag line with arrowhead at end
 *   note     — click once to drop a pin + open inline editor
 *
 * The layer doesn't own zoom or rotation — it just reads the current
 * viewport and re-projects. That keeps zoom / rotate behavior consistent
 * with the canvas underneath.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  eventToPdfPoint,
  newMarkupId,
  pdfRectToCanvas,
  pdfToCanvas,
  pointsToSvgAttr,
  simplifyStroke,
} from "./coords";

const ARROW_HEAD_SIZE = 10; // canvas pixels
const NOTE_PIN_SIZE = 22;   // canvas pixels

export default function AnnotationLayer({
  viewport,
  canvasWidth,
  canvasHeight,
  pdfPage,
  items,
  activeTool,
  activeColor,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
}) {
  const svgRef = useRef(null);

  // In-progress drawing state (not persisted until mouseup).
  // draft shape depends on activeTool.
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);

  // Filter to only this page's markup. Memo'd so React.memo at render time
  // doesn't re-diff the full list.
  const pageItems = useMemo(
    () => items.filter((m) => (m.pdf_page || 1) === pdfPage),
    [items, pdfPage],
  );

  const isDrawingTool = activeTool && activeTool !== "select";
  const cursor = cursorFor(activeTool);

  // ── Pointer handlers ─────────────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    if (!viewport || !isDrawingTool) return;
    // Left button only.
    if (e.button !== 0) return;
    e.preventDefault();
    const [x, y] = eventToPdfPoint(e, svgRef.current, viewport);

    if (activeTool === "pen") {
      setDraft({ kind: "pen", points: [{ x, y }] });
    } else if (activeTool === "rect") {
      setDraft({ kind: "rect", x0: x, y0: y, x1: x, y1: y });
    } else if (activeTool === "arrow") {
      setDraft({ kind: "arrow", x0: x, y0: y, x1: x, y1: y });
    } else if (activeTool === "note") {
      const id = newMarkupId();
      onAddItem({
        id,
        kind: "note",
        pdf_page: pdfPage,
        color: activeColor,
        geom: { x, y },
        text: "",
        created_at: new Date().toISOString(),
      });
      setEditingNoteId(id);
    }

    if (activeTool === "pen" || activeTool === "rect" || activeTool === "arrow") {
      // Capture subsequent pointer events so we get mouseup even when the
      // pointer leaves the SVG bounds.
      try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    }
  }, [activeTool, activeColor, isDrawingTool, onAddItem, pdfPage, viewport]);

  const handlePointerMove = useCallback((e) => {
    if (!draft || !viewport) return;
    const [x, y] = eventToPdfPoint(e, svgRef.current, viewport);
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === "pen") {
        return { ...prev, points: [...prev.points, { x, y }] };
      }
      if (prev.kind === "rect" || prev.kind === "arrow") {
        return { ...prev, x1: x, y1: y };
      }
      return prev;
    });
  }, [draft, viewport]);

  const handlePointerUp = useCallback((e) => {
    if (!draft) return;
    try { svgRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }

    if (draft.kind === "pen") {
      // Need at least 2 distinct points for a visible stroke.
      const pts = simplifyStroke(draft.points, 0.5);
      if (pts.length >= 2) {
        onAddItem({
          id: newMarkupId(),
          kind: "pen",
          pdf_page: pdfPage,
          color: activeColor,
          geom: { points: pts },
          created_at: new Date().toISOString(),
        });
      }
    } else if (draft.kind === "rect") {
      const x = Math.min(draft.x0, draft.x1);
      const y = Math.min(draft.y0, draft.y1);
      const w = Math.abs(draft.x1 - draft.x0);
      const h = Math.abs(draft.y1 - draft.y0);
      if (w > 2 && h > 2) {
        onAddItem({
          id: newMarkupId(),
          kind: "rect",
          pdf_page: pdfPage,
          color: activeColor,
          geom: { x, y, w, h },
          created_at: new Date().toISOString(),
        });
      }
    } else if (draft.kind === "arrow") {
      const dx = draft.x1 - draft.x0;
      const dy = draft.y1 - draft.y0;
      if (dx * dx + dy * dy > 4) {
        onAddItem({
          id: newMarkupId(),
          kind: "arrow",
          pdf_page: pdfPage,
          color: activeColor,
          geom: { x1: draft.x0, y1: draft.y0, x2: draft.x1, y2: draft.y1 },
          created_at: new Date().toISOString(),
        });
      }
    }

    setDraft(null);
  }, [draft, activeColor, onAddItem, pdfPage]);

  // Escape cancels an in-progress draft; Delete removes the selected item.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        setDraft(null);
        setSelectedId(null);
        setEditingNoteId(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        onRemoveItem(selectedId);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRemoveItem, selectedId]);

  if (!viewport || !canvasWidth || !canvasHeight) return null;

  // Build the draft preview once per render. Non-draft items are projected
  // individually inside the <MarkupItem/> component — that lets a single
  // re-render from zoom or rotate still be cheap.
  const draftPreview = draft ? renderDraft(draft, viewport, activeColor) : null;

  return (
    <svg
      ref={svgRef}
      width={canvasWidth}
      height={canvasHeight}
      viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: canvasWidth,
        height: canvasHeight,
        // Select mode passes clicks through to things below (nothing below
        // needs them right now, but the existing callout + link layers
        // already capture their own hotspots before we get here).
        pointerEvents: isDrawingTool || editingNoteId ? "auto" : "auto",
        cursor,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => {
        // In select mode, a click on empty SVG clears the selection.
        if (activeTool === "select" && e.target === svgRef.current) {
          setSelectedId(null);
          setEditingNoteId(null);
        }
      }}
    >
      {/* Arrowhead marker, reusable */}
      <defs>
        <marker
          id="sbp-arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth={ARROW_HEAD_SIZE}
          markerHeight={ARROW_HEAD_SIZE}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {pageItems.map((m) => (
        <MarkupItem
          key={m.id}
          item={m}
          viewport={viewport}
          selected={selectedId === m.id}
          editing={editingNoteId === m.id}
          interactive={activeTool === "select"}
          onSelect={() => {
            if (activeTool === "select") setSelectedId(m.id);
          }}
          onNoteDoubleClick={() => {
            if (activeTool === "select" && m.kind === "note") setEditingNoteId(m.id);
          }}
          onNoteTextChange={(text) => onUpdateItem(m.id, { text })}
          onNoteBlur={() => setEditingNoteId(null)}
        />
      ))}

      {draftPreview}
    </svg>
  );
}

function renderDraft(draft, viewport, color) {
  if (draft.kind === "pen") {
    return (
      <polyline
        points={pointsToSvgAttr(draft.points, viewport)}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.85}
      />
    );
  }
  if (draft.kind === "rect") {
    const r = pdfRectToCanvas(viewport, {
      x: Math.min(draft.x0, draft.x1),
      y: Math.min(draft.y0, draft.y1),
      w: Math.abs(draft.x1 - draft.x0),
      h: Math.abs(draft.y1 - draft.y0),
    });
    return (
      <rect
        x={r.left}
        y={r.top}
        width={r.width}
        height={r.height}
        stroke={color}
        strokeWidth={2}
        fill={color}
        fillOpacity={0.10}
        strokeDasharray="4 3"
      />
    );
  }
  if (draft.kind === "arrow") {
    const [x1, y1] = pdfToCanvas(viewport, draft.x0, draft.y0);
    const [x2, y2] = pdfToCanvas(viewport, draft.x1, draft.y1);
    return (
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
        markerEnd="url(#sbp-arrowhead)"
        opacity={0.85}
        strokeDasharray="4 3"
      />
    );
  }
  return null;
}

function MarkupItem({
  item,
  viewport,
  selected,
  editing,
  interactive,
  onSelect,
  onNoteDoubleClick,
  onNoteTextChange,
  onNoteBlur,
}) {
  const color = item.color || "#FF3D3D";
  const selectionOutline = selected
    ? { filter: "drop-shadow(0 0 3px rgba(200,155,32,0.9))" }
    : {};
  const handleClick = (e) => {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.();
  };

  if (item.kind === "pen") {
    return (
      <polyline
        points={pointsToSvgAttr(item.geom?.points || [], viewport)}
        stroke={color}
        strokeWidth={selected ? 3 : 2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ cursor: interactive ? "pointer" : "default", ...selectionOutline }}
        onClick={handleClick}
      />
    );
  }

  if (item.kind === "rect") {
    const r = pdfRectToCanvas(viewport, item.geom);
    return (
      <rect
        x={r.left}
        y={r.top}
        width={r.width}
        height={r.height}
        stroke={color}
        strokeWidth={selected ? 2.5 : 2}
        fill={color}
        fillOpacity={0.12}
        style={{ cursor: interactive ? "pointer" : "default", ...selectionOutline }}
        onClick={handleClick}
      />
    );
  }

  if (item.kind === "arrow") {
    const [x1, y1] = pdfToCanvas(viewport, item.geom.x1, item.geom.y1);
    const [x2, y2] = pdfToCanvas(viewport, item.geom.x2, item.geom.y2);
    return (
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={selected ? 3 : 2.25}
        strokeLinecap="round"
        markerEnd="url(#sbp-arrowhead)"
        style={{ cursor: interactive ? "pointer" : "default", ...selectionOutline }}
        onClick={handleClick}
      />
    );
  }

  if (item.kind === "note") {
    const [cx, cy] = pdfToCanvas(viewport, item.geom.x, item.geom.y);
    const size = NOTE_PIN_SIZE;
    return (
      <g
        style={{ cursor: interactive ? "pointer" : "default", ...selectionOutline }}
        onClick={handleClick}
        onDoubleClick={onNoteDoubleClick}
      >
        {/* Pin body */}
        <circle cx={cx} cy={cy} r={size / 2} fill={color} opacity={0.92} />
        <circle cx={cx} cy={cy} r={size / 2 - 3} fill="#fff" opacity={0.85} />
        <circle cx={cx} cy={cy} r={3} fill={color} />

        {editing ? (
          <foreignObject
            x={cx + size / 2 + 4}
            y={cy - size / 2}
            width={220}
            height={90}
          >
            <textarea
              xmlns="http://www.w3.org/1999/xhtml"
              id={`sbp-note-${item.id}`}
              name={`sbp-note-${item.id}`}
              aria-label="Markup note"
              autoFocus
              defaultValue={item.text || ""}
              onChange={(e) => onNoteTextChange?.(e.target.value)}
              onBlur={onNoteBlur}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.currentTarget.blur(); }
              }}
              style={{
                width: 220,
                height: 86,
                padding: "6px 8px",
                fontFamily: "var(--font-body)",
                fontSize: 12,
                color: "var(--text-primary)",
                background: "var(--bg-surface)",
                border: "1px solid var(--accent)",
                borderRadius: 4,
                resize: "none",
                outline: "none",
                boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
                boxSizing: "border-box",
              }}
              placeholder="Note…"
            />
          </foreignObject>
        ) : item.text ? (
          // Read-only label to the right of the pin
          <foreignObject
            x={cx + size / 2 + 4}
            y={cy - size / 2}
            width={220}
            height={80}
            pointerEvents="none"
          >
            <div
              xmlns="http://www.w3.org/1999/xhtml"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "#111",
                background: "rgba(255,240,180,0.95)",
                border: "1px solid rgba(0,0,0,0.25)",
                borderRadius: 3,
                padding: "4px 6px",
                maxWidth: 220,
                boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.35,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {item.text}
            </div>
          </foreignObject>
        ) : null}
      </g>
    );
  }

  return null;
}

function cursorFor(tool) {
  switch (tool) {
    case "pen":   return "crosshair";
    case "rect":  return "crosshair";
    case "arrow": return "crosshair";
    case "note":  return "copy";
    default:      return "default";
  }
}
