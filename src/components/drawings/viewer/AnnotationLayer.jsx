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

// Markup status (3a — code-only, no migration). Cycles open → addressed
// → rejected → clarification → open. Status colors mirror the comment
// thread palette (D + E in the spec) so the resolution semantics read
// the same across surfaces.
export const MARKUP_STATUS_ORDER = ["open", "addressed", "rejected", "clarification"];
export const MARKUP_STATUS_COLOR = {
  open:          "#9ca3af",
  addressed:     "#10b981",
  rejected:      "#ef4444",
  clarification: "#f59e0b",
};
const MARKUP_STATUS_LABEL = {
  open:          "OPEN",
  addressed:     "DONE",
  rejected:      "NO",
  clarification: "?",
};
function nextStatus(current) {
  const idx = MARKUP_STATUS_ORDER.indexOf(current || "open");
  return MARKUP_STATUS_ORDER[(idx + 1) % MARKUP_STATUS_ORDER.length];
}

export default function AnnotationLayer({
  viewport,
  canvasWidth,
  canvasHeight,
  pdfPage,
  items,
  activeTool,
  activeColor,
  markupScale,       // real_inches_per_pdf_inch; null = not calibrated
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onCalibrate,       // (pdfDist) => void — parent prompts user + persists scale
  hideResolved = false, // 3a — filters note items whose status is addressed/rejected
}) {
  const svgRef = useRef(null);

  // In-progress drawing state (not persisted until mouseup).
  // draft shape depends on activeTool.
  const [draft, setDraft] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [editingNoteId, setEditingNoteId] = useState(null);

  // Filter to only this page's markup. Memo'd so React.memo at render time
  // doesn't re-diff the full list.
  const pageItems = useMemo(() => {
    let list = items.filter((m) => (m.pdf_page || 1) === pdfPage);
    if (hideResolved) {
      // Only filter notes — drawing markup like a redline/rect doesn't
      // carry meaningful resolution semantics, and hiding them on the
      // "show unresolved" toggle would surprise users.
      list = list.filter((m) => {
        if (m.kind !== "note") return true;
        return !(m.status === "addressed" || m.status === "rejected");
      });
    }
    return list;
  }, [items, pdfPage, hideResolved]);

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
    } else if (activeTool === "highlight") {
      setDraft({ kind: "highlight", x0: x, y0: y, x1: x, y1: y });
    } else if (activeTool === "arrow") {
      setDraft({ kind: "arrow", x0: x, y0: y, x1: x, y1: y });
    } else if (activeTool === "measure" || activeTool === "calibrate") {
      // Both are two-click tools sharing the same draft state. On commit:
      //   - measure    → persists as a markup_item with kind="measure"
      //   - calibrate  → dispatches onCalibrate(pdfDist) to the parent,
      //                  which prompts the user for the real-world length
      //                  and saves the scale factor to the drawing row.
      if (!draft || (draft.kind !== "measure" && draft.kind !== "calibrate") || draft.committed) {
        setDraft({
          kind: activeTool,        // "measure" | "calibrate"
          x0: x, y0: y, x1: x, y1: y,
          tracking: true,
        });
      } else if (draft.tracking) {
        const dx = x - draft.x0;
        const dy = y - draft.y0;
        if (dx * dx + dy * dy > 1) {
          if (activeTool === "calibrate") {
            // PDF points → PDF inches (points are 1/72 inch)
            const pdfInches = Math.sqrt(dx * dx + dy * dy) / 72;
            onCalibrate?.(pdfInches);
          } else {
            onAddItem({
              id: newMarkupId(),
              kind: "measure",
              pdf_page: pdfPage,
              color: activeColor,
              geom: { x1: draft.x0, y1: draft.y0, x2: x, y2: y },
              created_at: new Date().toISOString(),
            });
          }
        }
        setDraft(null);
      }
      return; // two-click tools manage their own state — skip default capture
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

    if (activeTool === "pen" || activeTool === "rect" || activeTool === "highlight" || activeTool === "arrow") {
      // Capture subsequent pointer events so we get mouseup even when the
      // pointer leaves the SVG bounds. Measure uses a different gesture
      // (click → move → click) so it doesn't need pointer capture.
      try { svgRef.current?.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    }
  }, [activeTool, activeColor, isDrawingTool, onAddItem, pdfPage, viewport, draft]);

  const handlePointerMove = useCallback((e) => {
    if (!draft || !viewport) return;
    const [x, y] = eventToPdfPoint(e, svgRef.current, viewport);
    setDraft((prev) => {
      if (!prev) return prev;
      if (prev.kind === "pen") {
        return { ...prev, points: [...prev.points, { x, y }] };
      }
      if (prev.kind === "rect" || prev.kind === "highlight" || prev.kind === "arrow") {
        return { ...prev, x1: x, y1: y };
      }
      if ((prev.kind === "measure" || prev.kind === "calibrate") && prev.tracking) {
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
    } else if (draft.kind === "highlight") {
      const x = Math.min(draft.x0, draft.x1);
      const y = Math.min(draft.y0, draft.y1);
      const w = Math.abs(draft.x1 - draft.x0);
      const h = Math.abs(draft.y1 - draft.y0);
      if (w > 2 && h > 2) {
        // Highlight uses yellow by default even if activeColor is a
        // stroke-appropriate color (red/blue), because highlight needs
        // a translucent warm tone to read as "marked" without
        // obscuring the underlying PDF. If the user explicitly picked
        // a non-default color we honor it.
        onAddItem({
          id: newMarkupId(),
          kind: "highlight",
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
  const draftPreview = draft ? renderDraft(draft, viewport, activeColor, markupScale) : null;

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
          markupScale={markupScale}
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
          onCycleStatus={() => {
            if (m.kind !== "note") return;
            onUpdateItem(m.id, { status: nextStatus(m.status) });
          }}
        />
      ))}

      {draftPreview}
    </svg>
  );
}

function renderDraft(draft, viewport, color, scaleForLabel) {
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
  if (draft.kind === "highlight") {
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
        stroke="none"
        fill={color}
        fillOpacity={0.28}
      />
    );
  }
  if ((draft.kind === "measure" || draft.kind === "calibrate") && draft.tracking) {
    const [x1, y1] = pdfToCanvas(viewport, draft.x0, draft.y0);
    const [x2, y2] = pdfToCanvas(viewport, draft.x1, draft.y1);
    const dx = draft.x1 - draft.x0;
    const dy = draft.y1 - draft.y0;
    const pdfDist = Math.sqrt(dx * dx + dy * dy);
    // Calibration preview shows raw page inches (that's what the user is
    // about to assign a real value to). Measure preview honors the
    // current scale if set — reading in real units while aiming.
    const label = draft.kind === "calibrate"
      ? formatMeasureLabel(pdfDist, null)
      : formatMeasureLabel(pdfDist, scaleForLabel);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const stroke = draft.kind === "calibrate" ? "#00E5FF" : color;  // cyan for calibrate
    return (
      <g>
        {/* Endpoint crosshairs so the anchor point is obvious */}
        <circle cx={x1} cy={y1} r={5} fill="none" stroke={stroke} strokeWidth={2} />
        <circle cx={x2} cy={y2} r={5} fill="none" stroke={stroke} strokeWidth={2} />
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={stroke}
          strokeWidth={2}
          strokeDasharray="6 4"
          opacity={0.9}
        />
        <rect
          x={midX - 56} y={midY - 11}
          width={112} height={22}
          rx={3}
          fill="rgba(12,14,17,0.88)"
          stroke={stroke}
          strokeWidth={1}
        />
        <text
          x={midX} y={midY + 4}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={11}
          fontWeight={700}
          fill="#fff"
        >
          {draft.kind === "calibrate" ? `SET: ${label}` : label}
        </text>
      </g>
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
  markupScale,
  selected,
  editing,
  interactive,
  onSelect,
  onNoteDoubleClick,
  onNoteTextChange,
  onNoteBlur,
  onCycleStatus,
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

  if (item.kind === "highlight") {
    const r = pdfRectToCanvas(viewport, item.geom);
    return (
      <rect
        x={r.left}
        y={r.top}
        width={r.width}
        height={r.height}
        stroke={selected ? color : "none"}
        strokeWidth={selected ? 1.5 : 0}
        fill={color}
        fillOpacity={0.28}
        style={{ cursor: interactive ? "pointer" : "default", ...selectionOutline }}
        onClick={handleClick}
      />
    );
  }

  if (item.kind === "measure") {
    const [x1, y1] = pdfToCanvas(viewport, item.geom.x1, item.geom.y1);
    const [x2, y2] = pdfToCanvas(viewport, item.geom.x2, item.geom.y2);
    const dx = item.geom.x2 - item.geom.x1;
    const dy = item.geom.y2 - item.geom.y1;
    const label = formatMeasureLabel(Math.sqrt(dx * dx + dy * dy), markupScale);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    return (
      <g
        style={{ cursor: interactive ? "pointer" : "default", ...selectionOutline }}
        onClick={handleClick}
      >
        <circle cx={x1} cy={y1} r={4} fill={color} />
        <circle cx={x2} cy={y2} r={4} fill={color} />
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={color}
          strokeWidth={selected ? 2.5 : 2}
        />
        <rect
          x={midX - 42} y={midY - 11}
          width={84} height={22}
          rx={3}
          fill="rgba(12,14,17,0.88)"
          stroke={color}
          strokeWidth={1}
        />
        <text
          x={midX} y={midY + 4}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize={11}
          fontWeight={700}
          fill="#fff"
        >
          {label}
        </text>
      </g>
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
    const statusKey = item.status || "open";
    const statusColor = MARKUP_STATUS_COLOR[statusKey] || MARKUP_STATUS_COLOR.open;
    const statusLabel = MARKUP_STATUS_LABEL[statusKey] || statusKey.toUpperCase();
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

        {/* Status pill — above and slightly right of the pin. Click in
            select mode cycles open → addressed → rejected → clarification. */}
        {interactive && (
          <g
            transform={`translate(${cx + size / 2 - 6}, ${cy - size / 2 - 12})`}
            style={{ cursor: "pointer" }}
            onClick={(e) => { e.stopPropagation(); onCycleStatus?.(); }}
          >
            <rect
              x={0} y={0}
              width={36} height={12}
              rx={6}
              fill={statusColor}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.75}
            />
            <text
              x={18} y={9}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize={8}
              fontWeight={700}
              fill="#fff"
              style={{ letterSpacing: "0.06em" }}
            >
              {statusLabel}
            </text>
          </g>
        )}

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
    case "pen":       return "crosshair";
    case "rect":      return "crosshair";
    case "highlight": return "crosshair";
    case "arrow":     return "crosshair";
    case "measure":   return "crosshair";
    case "calibrate": return "crosshair";
    case "note":      return "copy";
    default:          return "default";
  }
}

/**
 * Format a distance in PDF user units (points: 1/72 inch) into an engineer-
 * friendly label.
 *
 * If `scale` is provided (real_inches_per_pdf_inch — see drawings.markup_scale
 * set by the Calibrate tool), the label reads as real-world feet-inches.
 * Without it, falls back to raw page-inches + a ~ prefix so the user knows
 * they're looking at page measurements, not real dimensions.
 *
 * Number formatting rules match how PMs read dimension strings on shop
 * drawings: under 12" → decimal inches (e.g. 8.3"), 12"+ → F'-I.I" format
 * (e.g. 14'-6.2"). No rounding beyond one decimal — users need enough
 * precision to eyeball whether a spec matches.
 */
function formatMeasureLabel(pdfDist, scale) {
  const pdfInches = pdfDist / 72;
  const inches = scale ? pdfInches * scale : pdfInches;
  const prefix = scale ? "" : "~"; // ~ means "page inches, not calibrated"
  if (inches < 12) {
    return `${prefix}${inches.toFixed(1)}"`;
  }
  const ft = Math.floor(inches / 12);
  const rem = inches - ft * 12;
  return `${prefix}${ft}'-${rem.toFixed(1)}"`;
}
