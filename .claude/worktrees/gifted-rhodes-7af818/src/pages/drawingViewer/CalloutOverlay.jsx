import React from "react";
import { normalizeSN } from "@/pages/drawingViewer/drawingViewerUtils";

// Regex-detected cross-sheet callout overlay. Each entry on
// `activeDrawing.callouts` carries a bbox (in PDF user units) plus a
// `targetSheetNumber`; we resolve that against the project drawing list at
// render time so a callout flagged unresolved at upload still hits a
// sibling that was uploaded later. Resolved callouts get a solid accent
// border and are clickable; unresolved ones go dashed and disabled.
//
// Pure presentation; everything is byte-identical to the JSX block this
// replaces.
export default function CalloutOverlay({
  activeDrawing,
  drawings,
  pageSize,
  zoom,
  onCalloutClick,
}) {
  if (!Array.isArray(activeDrawing?.callouts) || activeDrawing.callouts.length === 0) {
    return null;
  }
  return (
    <div
      style={{
        position: "absolute",
        top: 0, left: 0,
        width:  pageSize.width  * zoom,
        height: pageSize.height * zoom,
        pointerEvents: "none",
      }}
    >
      {activeDrawing.callouts.map((c, i) => {
        if (!c?.coords) return null;
        // Render-time resolution against the full project drawing
        // list — a callout flagged `resolved: false` at upload
        // time may still hit a sibling uploaded later.
        const match = drawings.find((d) =>
          normalizeSN(d.sheet_number) === normalizeSN(c.targetSheetNumber)
        );
        const resolved = !!match;
        return (
          <button
            key={i}
            disabled={!resolved}
            onClick={() => resolved && onCalloutClick(c)}
            title={resolved
              ? `${c.text} → ${match.sheet_number}${match.title ? ` · ${match.title}` : ""}`
              : `${c.text} (no sibling sheet found)`
            }
            style={{
              position: "absolute",
              left:   Math.max(0, c.coords.x      * zoom - 2),
              top:    Math.max(0, c.coords.y      * zoom - 2),
              width:  Math.max(12, c.coords.width  * zoom + 4),
              height: Math.max(12, c.coords.height * zoom + 4),
              background: resolved ? "rgba(200,155,32,0.18)" : "rgba(255,200,0,0.05)",
              border: resolved ? "2px solid var(--accent)" : "2px dashed rgba(200,155,32,0.35)",
              borderRadius: 2,
              cursor: resolved ? "pointer" : "not-allowed",
              pointerEvents: "auto",
              padding: 0,
              zIndex: 5,
            }}
          />
        );
      })}
    </div>
  );
}
