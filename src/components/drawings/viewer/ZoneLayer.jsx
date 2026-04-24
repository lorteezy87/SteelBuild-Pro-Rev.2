/**
 * ZoneLayer — SVG overlay for drawing-centered coordination zones.
 *
 * Runs parallel to AnnotationLayer on the Drawing Viewer canvas but
 * uses a different storage model: zones are normalized to the canvas
 * ([0,1] bbox or polygon vertices) instead of PDF user units, so they
 * stay aligned no matter the zoom or rotation as long as the canvas
 * re-renders to the same sheet.
 *
 * Interaction modes (driven by `mode` prop):
 *   "off"    — renders nothing, no pointer capture
 *   "view"   — existing zones rendered as status-colored shapes;
 *              click selects, double-click opens the right-side panel
 *   "draw"   — user creates a new zone. Shape depends on drawShape:
 *                "rect"    : click-drag a rectangle (MVP behaviour)
 *                "polygon" : click to place each vertex; double-click,
 *                            Enter, or click back near the first vertex
 *                            to finish; Escape cancels mid-draw
 *              mouseup (rect) or polygon-close fires
 *              onDrawComplete({ shape:"rect", xMin,yMin,xMax,yMax })
 *              or            onDrawComplete({ shape:"polygon", points })
 *
 * Keeps itself out of the way of AnnotationLayer by:
 *   - only capturing pointer events when mode === "draw" (otherwise
 *     pointerEvents="none" everywhere except the zone shapes themselves,
 *     which have pointerEvents="auto" for click/hover)
 *   - sitting ABOVE the annotation layer in z-order during "draw"
 *     mode, BELOW during "view" mode so markup stays interactive
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const MIN_PX       = 8;  // don't let a stray click create a 1px rectangle zone
const CLOSE_RADIUS = 10; // px tolerance for "click back on first vertex to close"

export default function ZoneLayer({
  mode = "view",            // "off" | "view" | "draw"
  drawShape = "rect",       // "rect" | "polygon" — only consulted in draw mode
  overlay = "status",       // "status" | "heatmap" — V2 render style for view mode
  zoneDensities,            // Map<zone_id, number> — only consulted when overlay==="heatmap"
  canvasWidth,
  canvasHeight,
  zones = [],               // drawing_zone rows (active + current revision)
  zoneSummaries,            // Map<zone_id, { total, byType }>
  selectedZoneId,           // currently focused zone
  onSelectZone,             // (zoneId) => void
  onOpenZone,               // (zoneId) => void — double-click / Enter
  onDrawComplete,           // see "Interaction modes" above
  // V3.0: Drawing Hub Analyzer→Zones bridge. Proposal bboxes are
  // rendered with a distinct dashed style so they don't masquerade
  // as real zones. Each entry: { id, x_min, y_min, x_max, y_max,
  // status, label? }. The parent owns hover state — pass an array
  // containing only the hovered proposal to focus it on the canvas.
  proposalOverlays = [],
}) {
  const svgRef = useRef(null);
  // Rectangle draft (one drag): { x0, y0, x1, y1 } in canvas px.
  const [rectDraft, setRectDraft] = useState(null);
  // Polygon draft (accumulated clicks): { points: [[x,y], …], hover: [x,y] | null }
  const [polyDraft, setPolyDraft] = useState(null);

  const active = mode !== "off" && canvasWidth > 0 && canvasHeight > 0;

  // ── Coordinate helpers ──────────────────────────────────────────────
  const canvasOriginToPoint = useCallback((ev) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return {
      x: Math.max(0, Math.min(canvasWidth,  ev.clientX - r.left)),
      y: Math.max(0, Math.min(canvasHeight, ev.clientY - r.top)),
    };
  }, [canvasWidth, canvasHeight]);

  const normalizePoint = useCallback((p) => {
    // Safety clamp — canvasOriginToPoint already clamps but floating
    // point drift can still push by epsilon. DB CHECK constraints
    // would reject those.
    return [
      Math.max(0, Math.min(1, p.x / canvasWidth)),
      Math.max(0, Math.min(1, p.y / canvasHeight)),
    ];
  }, [canvasWidth, canvasHeight]);

  // ── Polygon finish / cancel ─────────────────────────────────────────
  const cancelPolygonDraft = useCallback(() => setPolyDraft(null), []);

  const finishPolygonDraft = useCallback(async () => {
    if (!polyDraft || polyDraft.points.length < 3) {
      // Not enough vertices — drop the draft so the user can start over
      // without an "invalid polygon" toast every time they double-click.
      setPolyDraft(null);
      return;
    }
    const points = polyDraft.points.map(normalizePoint);
    setPolyDraft(null);
    try {
      await onDrawComplete?.({ shape: "polygon", points });
    } catch { /* caller surfaces the error */ }
  }, [polyDraft, normalizePoint, onDrawComplete]);

  // ── Keyboard: Enter finishes polygon, Escape cancels ────────────────
  useEffect(() => {
    if (mode !== "draw" || drawShape !== "polygon" || !polyDraft) return undefined;
    const onKey = (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finishPolygonDraft(); }
      else if (ev.key === "Escape") { ev.preventDefault(); cancelPolygonDraft(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, drawShape, polyDraft, finishPolygonDraft, cancelPolygonDraft]);

  // If the user switches draw shape mid-polygon, drop the draft so we
  // don't leave a partial ring as a ghost when they flip to rect mode.
  useEffect(() => {
    if (drawShape !== "polygon") setPolyDraft(null);
    if (drawShape !== "rect")    setRectDraft(null);
    if (mode !== "draw")         { setPolyDraft(null); setRectDraft(null); }
  }, [drawShape, mode]);

  // ── Mouse handlers (dispatch on mode + shape) ──────────────────────
  const onMouseDown = (ev) => {
    if (mode !== "draw") return;
    if (ev.button !== 0) return;  // left-click only; middle/right stay free for pan
    const p = canvasOriginToPoint(ev);
    if (!p) return;

    if (drawShape === "rect") {
      ev.preventDefault();
      setRectDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }

    // Polygon branch — each click adds a vertex. If we're close to the
    // first vertex and have at least 3 so far, treat this click as
    // "close the ring" instead.
    if (drawShape === "polygon") {
      ev.preventDefault();
      setPolyDraft((cur) => {
        if (!cur) return { points: [[p.x, p.y]], hover: null };
        const first = cur.points[0];
        const dx = p.x - first[0];
        const dy = p.y - first[1];
        if (cur.points.length >= 3 && Math.sqrt(dx * dx + dy * dy) <= CLOSE_RADIUS) {
          // Closing click — schedule the finish after state settles so
          // finishPolygonDraft sees the fully-populated draft.
          queueMicrotask(() => {
            setPolyDraft((latest) => {
              if (!latest || latest.points.length < 3) return latest;
              const points = latest.points.map((pt) => [
                Math.max(0, Math.min(1, pt[0] / canvasWidth)),
                Math.max(0, Math.min(1, pt[1] / canvasHeight)),
              ]);
              onDrawComplete?.({ shape: "polygon", points });
              return null;
            });
          });
          return cur;
        }
        return { ...cur, points: [...cur.points, [p.x, p.y]] };
      });
    }
  };

  const onMouseMove = (ev) => {
    if (mode !== "draw") return;
    const p = canvasOriginToPoint(ev);
    if (!p) return;

    if (drawShape === "rect" && rectDraft) {
      setRectDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
    } else if (drawShape === "polygon" && polyDraft) {
      setPolyDraft((cur) => (cur ? { ...cur, hover: [p.x, p.y] } : cur));
    }
  };

  const onMouseUp = async () => {
    if (mode !== "draw" || drawShape !== "rect" || !rectDraft) return;
    const x0 = Math.min(rectDraft.x0, rectDraft.x1);
    const x1 = Math.max(rectDraft.x0, rectDraft.x1);
    const y0 = Math.min(rectDraft.y0, rectDraft.y1);
    const y1 = Math.max(rectDraft.y0, rectDraft.y1);
    setRectDraft(null);
    if ((x1 - x0) < MIN_PX || (y1 - y0) < MIN_PX) return; // discard stray
    const bbox = {
      xMin: x0 / canvasWidth,
      yMin: y0 / canvasHeight,
      xMax: x1 / canvasWidth,
      yMax: y1 / canvasHeight,
    };
    bbox.xMin = Math.max(0, Math.min(1, bbox.xMin));
    bbox.yMin = Math.max(0, Math.min(1, bbox.yMin));
    bbox.xMax = Math.max(0, Math.min(1, bbox.xMax));
    bbox.yMax = Math.max(0, Math.min(1, bbox.yMax));
    if (bbox.xMax <= bbox.xMin || bbox.yMax <= bbox.yMin) return;
    try {
      await onDrawComplete?.({ shape: "rect", ...bbox });
    } catch { /* caller handles */ }
  };

  // Double-click in polygon draw mode finishes the ring.
  const onDoubleClick = (ev) => {
    if (mode !== "draw" || drawShape !== "polygon" || !polyDraft) return;
    ev.preventDefault();
    finishPolygonDraft();
  };

  // ── Computed draft shapes for rendering ────────────────────────────
  const draftRect = useMemo(() => {
    if (!rectDraft) return null;
    const x = Math.min(rectDraft.x0, rectDraft.x1);
    const y = Math.min(rectDraft.y0, rectDraft.y1);
    const w = Math.abs(rectDraft.x1 - rectDraft.x0);
    const h = Math.abs(rectDraft.y1 - rectDraft.y0);
    return { x, y, w, h };
  }, [rectDraft]);

  const draftPolyPointsAttr = useMemo(() => {
    if (!polyDraft || polyDraft.points.length === 0) return null;
    const segs = polyDraft.points.map(([x, y]) => `${x},${y}`);
    return segs.join(" ");
  }, [polyDraft]);

  // Heatmap normalization. Max density across the visible zones drives
  // the top of the color ramp — that way an "everything cool" sheet
  // doesn't render as all red just because its worst zone scored 3.
  // Floor the max at HEATMAP_MIN so a sheet with density [0,0,1] still
  // shows the one hot zone as clearly warm instead of max-red.
  const HEATMAP_MIN = 5;
  const maxDensity = useMemo(() => {
    if (overlay !== "heatmap" || !zoneDensities) return 0;
    let m = 0;
    for (const z of zones) {
      const d = zoneDensities.get?.(z.id) || 0;
      if (d > m) m = d;
    }
    return Math.max(HEATMAP_MIN, m);
  }, [overlay, zoneDensities, zones]);

  // Heat ramp: cool-transparent at 0 → amber at mid → red at max.
  // Returns { fill, border } that mirrors the STATUS_COLORS shape so
  // the downstream render path doesn't need to branch on overlay mode.
  const heatPalette = (density) => {
    if (!density || density <= 0) {
      return { fill: "rgba(148,163,184,0.05)", border: "rgba(148,163,184,0.35)" };
    }
    const t = Math.max(0, Math.min(1, density / (maxDensity || 1)));
    // Interpolate: cool blue (low) → amber (mid) → red (high). Three
    // stops keep the transition readable at a glance.
    // Stops in RGB:
    //   0.0: 59,130,246  (blue-500)
    //   0.5: 245,158,11  (amber-500)
    //   1.0: 239,68,68   (red-500)
    let r, g, b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = Math.round(59  + (245 - 59)  * k);
      g = Math.round(130 + (158 - 130) * k);
      b = Math.round(246 + (11  - 246) * k);
    } else {
      const k = (t - 0.5) / 0.5;
      r = Math.round(245 + (239 - 245) * k);
      g = Math.round(158 + (68  - 158) * k);
      b = Math.round(11  + (68  - 11)  * k);
    }
    const alphaFill   = 0.15 + 0.30 * t; // 0.15 → 0.45 so hot zones pop
    const alphaBorder = 0.70 + 0.30 * t;
    return {
      fill:   `rgba(${r},${g},${b},${alphaFill})`,
      border: `rgba(${r},${g},${b},${alphaBorder})`,
    };
  };

  // Pre-compute zone rendering payload so the JSX below isn't a maze.
  // For rectangles we emit a <rect>; for polygons we emit a <polygon>.
  // The label chip uses the bbox (x_min/y_min/x_max/y_max) either way
  // so positioning stays consistent.
  const zoneShapes = useMemo(() => zones.map((z) => {
    const density = zoneDensities?.get?.(z.id) || 0;
    const palette = overlay === "heatmap"
      ? heatPalette(density)
      : (STATUS_COLORS[z.status] || STATUS_COLORS.neutral);
    const xPx = z.x_min * canvasWidth;
    const yPx = z.y_min * canvasHeight;
    const wPx = (z.x_max - z.x_min) * canvasWidth;
    const hPx = (z.y_max - z.y_min) * canvasHeight;
    const isSelected = z.id === selectedZoneId;
    const summary = zoneSummaries?.get?.(z.id);
    const count = summary?.total || 0;
    const isPolygon = z.shape_type === "polygon" && Array.isArray(z.polygon_points) && z.polygon_points.length >= 3;
    const polygonAttr = isPolygon
      ? z.polygon_points.map(([x, y]) => `${x * canvasWidth},${y * canvasHeight}`).join(" ")
      : null;
    return { z, palette, xPx, yPx, wPx, hPx, isSelected, count, isPolygon, polygonAttr, density };
    // maxDensity closes over heatPalette; adding it keeps the memo
    // honest when densities shift under the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [zones, canvasWidth, canvasHeight, selectedZoneId, zoneSummaries, overlay, zoneDensities, maxDensity]);

  if (!active) return null;

  // Pointer-capture strategy:
  //   - in "draw" mode the whole SVG captures pointer events so drags work
  //     anywhere over the canvas (zones are decorative)
  //   - in "view" mode the SVG is inert and only the individual shapes
  //     capture clicks; this keeps AnnotationLayer interactive below.
  const svgPointerEvents = mode === "draw" ? "auto" : "none";
  const shapePointerEvents = mode === "draw" ? "none" : "auto";

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
        cursor: mode === "draw" ? (drawShape === "polygon" ? "crosshair" : "crosshair") : "default",
        zIndex: mode === "draw" ? 25 : 15,
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onDoubleClick={onDoubleClick}
      onMouseLeave={onMouseUp /* commit rect draft on leave so a quick off-canvas drag doesn't leave a phantom */}
    >
      {zoneShapes.map(({ z, palette, xPx, yPx, wPx, hPx, isSelected, count, isPolygon, polygonAttr, density }) => (
        <g
          key={z.id}
          style={{ pointerEvents: shapePointerEvents, cursor: "pointer" }}
          onClick={(ev) => { ev.stopPropagation(); onSelectZone?.(z.id); }}
          onDoubleClick={(ev) => { ev.stopPropagation(); onOpenZone?.(z.id); }}
        >
          <title>
            {`${z.zone_key} · ${z.label}${count ? ` — ${count} linked item${count !== 1 ? "s" : ""}` : " — no links yet"}${overlay === "heatmap" ? ` · density ${density.toFixed(1)}` : ""}`}
          </title>
          {isPolygon ? (
            <polygon
              points={polygonAttr}
              fill={palette.fill}
              stroke={palette.border}
              strokeWidth={isSelected ? 3 : 1.75}
              strokeDasharray={overlay !== "heatmap" && z.status === "neutral" ? "4 3" : undefined}
              style={{ transition: "stroke-width 0.1s" }}
            />
          ) : (
            <rect
              x={xPx} y={yPx} width={wPx} height={hPx}
              fill={palette.fill}
              stroke={palette.border}
              strokeWidth={isSelected ? 3 : 1.75}
              strokeDasharray={overlay !== "heatmap" && z.status === "neutral" ? "4 3" : undefined}
              rx={2}
              ry={2}
              style={{ transition: "stroke-width 0.1s" }}
            />
          )}
          {/* Label chip — top-left of the bbox so polygons and rectangles
              land their labels in the same place. Hidden if the bbox is
              too small for the chip to look right. */}
          {wPx >= 56 && hPx >= 20 && (
            <g transform={`translate(${xPx + 4}, ${yPx + 4})`}>
              <rect
                width={Math.min(wPx - 8, 96)}
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
      ))}

      {/* Live rectangle draft while dragging */}
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

      {/* ── V3.0 Proposal overlays — distinct dashed cyan/amber so they
          don't look like real zones. Rendered above zone shapes but
          ignore pointer events; the ProposalPanel handles selection. */}
      {Array.isArray(proposalOverlays) && proposalOverlays.length > 0 && (
        <g pointerEvents="none">
          {proposalOverlays.map((p) => {
            if (
              p == null ||
              typeof p.x_min !== "number" || typeof p.y_min !== "number" ||
              typeof p.x_max !== "number" || typeof p.y_max !== "number"
            ) return null;
            const x = p.x_min * canvasWidth;
            const y = p.y_min * canvasHeight;
            const w = Math.max(0, (p.x_max - p.x_min)) * canvasWidth;
            const h = Math.max(0, (p.y_max - p.y_min)) * canvasHeight;
            const colorByStatus = {
              pending:  { fill: "rgba(0,229,255,0.10)",  border: "#00E5FF" },
              accepted: { fill: "rgba(34,197,94,0.10)",  border: "#22C55E" },
              rejected: { fill: "rgba(148,163,184,0.08)", border: "#94A3B8" },
              merged:   { fill: "rgba(139,92,246,0.10)", border: "#8B5CF6" },
            };
            const palette = colorByStatus[p.status] || colorByStatus.pending;
            return (
              <g key={`proposal-${p.id}`}>
                <rect
                  x={x} y={y} width={w} height={h}
                  fill={palette.fill}
                  stroke={palette.border}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  rx={2} ry={2}
                />
                {p.label && w >= 60 && h >= 18 && (
                  <g transform={`translate(${x + 4}, ${y + 4})`}>
                    <rect
                      width={Math.min(w - 8, 120)}
                      height={14}
                      fill="rgba(15,17,24,0.78)"
                      stroke={palette.border}
                      strokeWidth={0.75}
                      strokeDasharray="3 2"
                      rx={2} ry={2}
                    />
                    <text
                      x={5} y={10}
                      fontFamily="var(--font-mono, monospace)"
                      fontSize={9}
                      fontWeight={700}
                      fill="#FFFFFF"
                      style={{ letterSpacing: "0.04em" }}
                    >
                      {String(p.label).slice(0, 24)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* Live polygon draft — in-progress ring + hover preview segment
          so the user sees where the next vertex would land. Vertices get
          small filled circles; the first vertex becomes a larger target
          once we have 3+ points so the "click to close" affordance is
          obvious. */}
      {polyDraft && (
        <g pointerEvents="none">
          {/* Preview ring including the hovered segment, if any. We draw
              a polyline (not polygon) during drafting so it's clearly
              "not closed yet" until the user commits. */}
          <polyline
            points={
              draftPolyPointsAttr +
              (polyDraft.hover ? ` ${polyDraft.hover[0]},${polyDraft.hover[1]}` : "")
            }
            fill="none"
            stroke={DRAFT_COLOR.border}
            strokeWidth={2}
            strokeDasharray="5 3"
          />
          {/* Faint fill preview so the user feels the shape take form.
              We include the hover point here too so the preview fill
              tracks the mouse. */}
          {polyDraft.points.length >= 2 && (
            <polygon
              points={
                draftPolyPointsAttr +
                (polyDraft.hover ? ` ${polyDraft.hover[0]},${polyDraft.hover[1]}` : "")
              }
              fill={DRAFT_COLOR.fill}
              stroke="none"
            />
          )}
          {polyDraft.points.map((pt, i) => {
            const isFirst = i === 0;
            const canClose = polyDraft.points.length >= 3 && isFirst;
            return (
              <circle
                key={i}
                cx={pt[0]}
                cy={pt[1]}
                r={canClose ? 6 : 3.5}
                fill={canClose ? "rgba(0,229,255,0.25)" : DRAFT_COLOR.border}
                stroke={DRAFT_COLOR.border}
                strokeWidth={canClose ? 2 : 1}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}
