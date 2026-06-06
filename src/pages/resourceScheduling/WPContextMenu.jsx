import React from "react";
import { entities } from "@/api/supabaseClient";
import { wpBudgetHoursForResource } from "@/lib/wpHoursForResource";
import { hoursToWorkdays, addWorkdays } from "@/lib/workweek";

/**
 * Right-click context menu for a work-package bar. Lets the PM
 * reassign the WP to any resource or unassign it outright. The menu
 * is a plain fixed-position div so it escapes the timeline's scroll
 * container without portal gymnastics.
 */
export default function WPContextMenu({
  contextMenu,
  resources = [],
  qc,
  onClose,
  onToast,
}) {
  if (!contextMenu) return null;

  const { wp, x, y } = contextMenu;
  const isUnscheduled = !wp.scheduled_start_date || !wp.scheduled_end_date;

  const reassign = async (res) => {
    const patch = { crew: res.name };
    // If the WP has no scheduling window yet, default it to today → today
    // + estimated workdays (based on phase-appropriate budget hours, or
    // tonnage fallback). Keeps the assignment meaningful — the bar
    // actually lands on the board instead of staying in the Unscheduled
    // tray.
    if (isUnscheduled) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const budgetHrs = wpBudgetHoursForResource(wp);
      const workdays = budgetHrs > 0
        ? hoursToWorkdays(budgetHrs)
        : Math.max(3, Math.ceil((Number(wp.tonnage) || 0) / 2));
      const end = addWorkdays(today, workdays);
      const iso = (d) => d.toISOString().split("T")[0];
      patch.scheduled_start_date = iso(today);
      patch.scheduled_end_date   = iso(end);
    }
    await entities.WorkPackage.update(wp.id, patch);
    qc.invalidateQueries({ queryKey: ["work-packages"] });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
    onClose();
    onToast?.(`${wp.wp_number} → ${res.name}`);
  };

  const unassign = async () => {
    // Clearing crew + scheduling window sends the WP back to the
    // Unscheduled tray. Leave released_date alone (that's a separate
    // milestone — date released to shop — not the scheduling window).
    await entities.WorkPackage.update(wp.id, {
      crew: "",
      scheduled_start_date: null,
      scheduled_end_date: null,
    });
    qc.invalidateQueries({ queryKey: ["work-packages"] });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
    onClose();
    onToast?.(`${wp.wp_number} unassigned`);
  };

  return (
    <div
      id="rs-wp-context-menu"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: x, top: y,
        background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
        borderRadius: 8, padding: "4px 0", zIndex: 10000,
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)", minWidth: 200,
      }}
    >
      <div style={{
        padding: "6px 12px",
        fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
        letterSpacing: "0.12em", borderBottom: "1px solid var(--divider)", marginBottom: 4,
      }}>
        {wp.wp_number} — {wp.name}
      </div>
      <div style={{
        padding: "2px 12px 4px",
        fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
        letterSpacing: "0.10em", textTransform: "uppercase",
      }}>
        {isUnscheduled ? "Assign to" : "Reassign to"}
      </div>

      {resources.map((res) => {
        const isCurrent = wp.crew === res.name;
        return (
          <button
            key={res.id}
            onClick={() => reassign(res)}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(245,158,11,0.10)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = isCurrent ? "var(--accent-muted)" : "transparent")}
            style={{
              display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
              background: isCurrent ? "var(--accent-muted)" : "transparent",
              border: "none", color: "var(--text-primary)",
              fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
            }}
          >
            {res.name}{" "}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              ({res.role})
            </span>
          </button>
        );
      })}

      {(wp.crew || !isUnscheduled) && (
        <>
          <div style={{ borderTop: "1px solid var(--divider)", margin: "4px 0" }} />
          <button
            onClick={unassign}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,23,68,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            style={{
              display: "block", width: "100%", padding: "7px 12px", textAlign: "left",
              background: "transparent", border: "none", color: "var(--status-error-bright)",
              fontFamily: "var(--font-body)", fontSize: 11, cursor: "pointer",
            }}
          >
            Unassign &amp; unschedule
          </button>
        </>
      )}
    </div>
  );
}
