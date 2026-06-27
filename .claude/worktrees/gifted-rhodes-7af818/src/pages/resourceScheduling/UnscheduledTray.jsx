import React from "react";
import { wpBudgetHoursForResource } from "@/lib/wpHoursForResource";
import { hoursToWorkdays } from "@/lib/workweek";

/**
 * The "Unscheduled" pile at the bottom of the left rail.
 * Each card is draggable (pointerdown) and right-clickable (contextmenu
 * → assign menu). Parent owns the handlers.
 */
export default function UnscheduledTray({
  unscheduledWps = [],
  onPointerDown,
  onOpenContextMenu,
}) {
  if (unscheduledWps.length === 0) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--bg-surface-high)",
        padding: "12px 12px 8px 0",
        marginTop: 12,
      }}
    >
      <div
        style={{
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        UNSCHEDULED ({unscheduledWps.length})
      </div>

      {unscheduledWps.map((wp) => (
        <div
          key={wp.id}
          onPointerDown={(e) => onPointerDown(e, wp)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenContextMenu({ x: e.clientX, y: e.clientY, wp });
          }}
          style={{
            background: "var(--bg-surface-low)",
            border: "1px dashed var(--border-strong)",
            borderRadius: 8,
            padding: "8px 10px",
            marginBottom: 6,
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          <div style={{ fontSize: 11, fontFamily: "var(--font-body)", color: "var(--text-secondary)", fontWeight: 600 }}>
            {wp.name}
          </div>
          <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--status-warning)", marginTop: 2 }}>
            {wp.wp_number} {"\u00B7"} {wp.phase}
          </div>
          {/* Smart duration hint — workday-based, phase-aware */}
          {wpBudgetHoursForResource(wp) > 0 && (
            <div style={{ fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--accent)", marginTop: 2, letterSpacing: "0.02em" }}>
              {"\u2248"} {hoursToWorkdays(wpBudgetHoursForResource(wp))} workdays
            </div>
          )}
          <div style={{ fontSize: 8, color: "rgba(200,155,32,0.5)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
            {"\u2195"} drag to assign to resource
          </div>
        </div>
      ))}
    </div>
  );
}
