import React from "react";
import { PHASE_COLORS } from "./utils";

/**
 * One draggable WP bar on a resource row's timeline.
 * Positioning is supplied by the caller via `pos = { left, width }`
 * (computed from wp.scheduled_start_date / scheduled_end_date).
 * Handlers are lifted — the bar doesn't know about drag state,
 * context menu state, or tooltip state, just notifies the parent
 * through the callbacks.
 */
export default function WorkPackageBar({
  wp,
  pos,
  resourceId,
  resourceName,
  onPointerDown,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
}) {
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, wp, resourceId, resourceName)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu({ x: e.clientX, y: e.clientY, wp });
      }}
      onMouseEnter={(e) => onMouseEnter?.(e, wp)}
      onMouseLeave={onMouseLeave}
      style={{
        position: "absolute",
        left: `${pos.left}px`,
        width: `${pos.width}px`,
        top: 8,
        height: 36,
        borderRadius: 6,
        background: PHASE_COLORS[wp.phase] || PHASE_COLORS.default,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        padding: "0 8px",
        overflow: "hidden",
        userSelect: "none",
        zIndex: 10,
        // Crisp edge + subtle inner highlight + drop shadow — makes the bar
        // read as a solid chip in both light and dark themes. Previously
        // just had the drop shadow which disappeared on white surfaces.
        border: "1px solid rgba(0,0,0,0.14)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.18)",
      }}
    >
      {/* Progress overlay */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          height: "100%",
          width: `${wp.percent_complete || 0}%`,
          background: "rgba(255,255,255,0.15)",
          borderRadius: 6,
        }}
      />

      {/* WP Name */}
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          fontWeight: 600,
          color: "white",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          position: "relative",
          zIndex: 1,
        }}
      >
        {wp.name}
      </span>

      {/* WP Number (only when the bar is wide enough to show it) */}
      {pos.width > 120 && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "rgba(255,255,255,0.55)",
            background: "rgba(0,0,0,0.3)",
            borderRadius: 3,
            padding: "1px 4px",
            marginLeft: 4,
            position: "relative",
            zIndex: 1,
            flexShrink: 0,
          }}
        >
          {wp.wp_number}
        </span>
      )}
    </div>
  );
}
