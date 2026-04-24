/**
 * ZoneLayer — SVG overlay for drawing-centered coordination zones.
 *
 * Runs parallel to AnnotationLayer on the Drawing Viewer canvas but
 * uses a different storage model: zones are normalized to the canvas
 * ([0,1] bbox) instead of PDF user units, so they stay aligned no
 * matter the zoom or rotation as long as the canvas re-renders to the
 * same sheet.
 *
 * Three interaction modes (driven by `mode` prop):
 *   "off"    — component renders nothing, no pointer capture
 *   "view"   — existing zones rendered as status-colored rectangles;
 *              click selects, double-click opens the right-side panel
 *   "draw"   — user drag-creates a new rectangle; mouseup fires
 *              onDrawComplete({xMin,yMin,xMax,yMax}); parent does the
 *              create + any follow-up UX (label prompt, etc.)
 *
 * Keeps itself out of the way of AnnotationLayer by:
 *   - only capturing pointer events when mode === "draw" (otherwise
 *     pointerEvents="none" everywhere except the zone rectangles
 *     themselves, which have pointerEvents="auto" for click/hover)
 *   - sitting ABOVE the annotation layer in z-order during "draw"
 *     mode, BELOW during "view" mode so markup stays interactive
 */

import React, { useMemo, useRef, useState } from "react";

// Matches drawing_zones status CHECK constraint. Key colors tuned to
// be visible on both a white sheet and the dark viewport padding —
// semi-transparent fill + solid border mirrors the spec's UX states.
const STATUS_COLORS = {
  green:   { fill: "rgba(34,197,94,0.14)",   border: "#22C55E" },
  blue:    { fill: "rgba(59,130,246,0.14)",  border: "#3B82F6" },
  amber:   { fill: "rgba(245,158,11,0.16)",  border: "#F59E0B" },
  red:     { fill: "rgba(239,68,68,0.16)",   border: "#EF4444" },
  purple:  { fill: "rgba(139,92,246,0.14)",  border: "#8B5CF6" },
  neutral: { fill: "rgba(148,163,184,0.12)", border: "#94A3B8" },
};
const DRAFT_COLOR = { fill: "rgba(0,229,255,0.14)", border: "#00E5FF" };

const MIN_PX = 8; // don't let a stray click create a 1px zone

export default function ZoneLayer({
  mode = "view",            // "off" | "view" | "draw"
  canvasWidth,
  canvasHeight,
  zones = [],               // drawing_zone rows (active + current revision)
  zoneSummaries,            // Map<zone_id, { total, byType }>
  selectedZoneId,           // currently focused zone
  onSelectZone,             // (zoneId) => void
  onOpenZone,               // (zoneId) => void — double-click / Enter
  onDrawComplete,           // ({xMin,yMin,xMax,yMax}) => Promise
}) {
  const svgRef = useRef(null);
  const [draft, setDraft] = useState(null); // { x0, y0, x1, y1 } in canvas px

  const active = mode !== "off" && canvasWidth > 0 && canvasHeight > 0;
  const canvasOriginToPoint = (ev) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.max(0, Math.min(canvasWidth,  ev.clientX - r.left)),
      y: Math.max(0, Math.min(canvasHeight, ev.clientY - r.top)),
    };
  };

  const onMouseDown = (ev) => {
    if (mode !== "draw") return;
    // Only left-button starts a draft. Spacebar-pan in the parent still
    // intercepts first, so this won't fight panning.
    if (ev.button !== 0) return;
    const p = canvasOriginToPoint(ev);
    if (!p) return;
    ev.preventDefault();
    setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };
  const onMouseMove = (ev) => {
    if (!draft || mode !== "draw") return;
    const p = canvasOriginToPoint(ev);
    if (!p) return;
    setDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
  };
  const onMouseUp = async () => {
    if (!draft || mode !== "draw") { setDraft(null); return; }
    const x0 = Math.min(draft.x0, draft.x1);
    const x1 = Math.max(draft.x0, draft.x1);
    const y0 = Math.min(draft.y0, draft.y1);
    const y1 = Math.max(draft.y0, draft.y1);
    setDraft(null);
    if ((x1 - x0) < MIN_PX || (y1 - y0) < MIN_PX) return; // discard stray
    const bbox = {
      xMin: x0 / canvasWidth,
      yMin: y0 / canvasHeight,
      xMax: x1 / canvasWidth,
      yMax: y1 / canvasHeight,
    };
    // Safety clamp — canvasOriginToPoint already clamps but floating
    // point drift can still push by epsilon. DB CHECK constraints
    // would reject those.
    bbox.xMin = Math.max(0, Math.min(1, bbox.xMin));
    bbox.yMin = Math.max(0, Math.min(1, bbox.yMin));
    bbox.xMax = Math.max(0, Math.min(1, bbox.xMax));
    bbox.yMax = Math.max(0, Math.min(1, bbox.yMax));
    if (bbox.xMax <= bbox.xMin || bbox.yMax <= bbox.yMin) return;
    try { await onDrawComplete?.(bbox); } catch { /* caller handles */ }
  };

  const draftRect = useMemo(() => {
    if (!draft) return null;
    const x = Math.min(draft.x0, draft.x1);
    const y = Math.min(draft.y0, draft.y1);
    const w = Math.abs(draft.x1 - draft.x0);
    const h = Math.abs(draft.y1 - draft.y0);
    return { x, y, w, h };
  }, [draft]);

  if (!active) return null;

  // Pointer-capture strategy:
  //   - in "draw" mode the whole SVG captures pointer events so drags work
  //     anywhere over the canvas (zones are decorative)
  //   - in "view" mode the SVG is inert and only the individual rectangles
  //     capture clicks; this keeps AnnotationLayer interactive below.
  const svgPointerEvents = mode === "draw" ? "auto" : "none";
  const rectPointerEvents = mode === "draw" ? "none" : "auto";

  return (
    <svg
      ref={svgRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        position: "absolute",
        top: 0, left: 0,
        width:  canvasWidth,
        height: canvasHeight,
        pointerEvents: svgPointerEvents,
        cursor: mode === "draw" ? "crosshair" : "default",
        zIndex: mode === "draw" ? 25 : 15,
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp /* commit on leave so a quick off-canvas drag doesn't leave a phantom draft */}
    >
      {zones.map((z) => {
        const palette = STATUS_COLORS[z.status] || STATUS_COLORS.neutral;
        const x = z.x_min * canvasWidth;
        const y = z.y_min * canvasHeight;
        const w = (z.x_max - z.x_min) * canvasWidth;
        const h = (z.y_max - z.y_min) * canvasHeight;
        const isSelected = z.id === selectedZoneId;
        const summary = zoneSummaries?.get?.(z.id);
        const count = summary?.total || 0;

        return (
          <g
            key={z.id}
            style={{ pointerEvents: rectPointerEvents, cursor: "pointer" }}
            onClick={(ev) => { ev.stopPropagation(); onSelectZone?.(z.id); }}
            onDoubleClick={(ev) => { ev.stopPropagation(); onOpenZone?.(z.id); }}
          >
            <title>
              {`${z.zone_key} · ${z.label}${count ? ` — ${count} linked item${count !== 1 ? "s" : ""}` : " — no links yet"}`}
            </title>
            <rect
              x={x} y={y} width={w} height={h}
              fill={palette.fill}
              stroke={palette.border}
              strokeWidth={isSelected ? 3 : 1.75}
              strokeDasharray={z.status === "neutral" ? "4 3" : undefined}
              rx={2}
              ry={2}
              style={{ transition: "stroke-width 0.1s" }}
            />
            {/* Label chip — top-left corner, scaled to zone size so it
                doesn't cover tiny zones. Hidden if the zone is smaller
                than the chip itself. */}
            {w >= 56 && h >= 20 && (
              <g transform={`translate(${x + 4}, ${y + 4})`}>
                <rect
                  width={Math.min(w - 8, 96)}
                  height={14}
                  fill="rgba(15,17,24,0.72)"
                  stroke={palette.border}
                  strokeWidth={0.75}
                  rx={2}
                  ry={2}
                />
                <text
                  x={5} y={10}
                  fontFamily="var(--font-mono, 'JetBrains Mono', monospace)"
                  fontSize={9}
                  fontWeight={700}
                  fill="#FFFFFF"
                  style={{ letterSpacing: "0.04em" }}
                >
                  {z.zone_key}{count > 0 ? ` · ${count}` : ""}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Live draft rectangle while dragging */}
      {draftRect && (
        <rect
          x={draftRect.x} y={draftRect.y}
          width={draftRect.w} height={draftRect.h}
          fill={DRAFT_COLOR.fill}
          stroke={DRAFT_COLOR.border}
          strokeWidth={2}
          strokeDasharray="4 3"
          rx={2}
          ry={2}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}
