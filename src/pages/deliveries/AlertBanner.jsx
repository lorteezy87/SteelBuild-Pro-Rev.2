/**
 * AlertBanner — the "ATTENTION REQUIRED" red strip that appears when
 * there are overdue or partial/rejected deliveries. Shows up to 4
 * overdue chips so the user has immediate context on what's late.
 */

import React from "react";

export default function AlertBanner({
  visible,
  overdueDeliveries,
  wpMap,
  projectMap,
  today,
  onChipClick,
}) {
  if (!visible) return null;

  return (
    <div
      style={{
        background: "var(--danger-muted)",
        borderBottom: "1px solid var(--danger-border)",
        padding: "8px 20px",
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.12em" }}>
        ATTENTION REQUIRED
      </span>
      {overdueDeliveries.slice(0, 4).map((d) => {
        const daysLate = Math.max(1, Math.ceil((today - new Date(d.scheduled_date)) / 86400000));
        return (
          <span
            key={d.id}
            onClick={() => onChipClick(d)}
            style={{
              background: "rgba(239,68,68,0.14)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: 4,
              padding: "4px 8px",
              fontFamily: "var(--font-body)",
              fontSize: 10,
              color: "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {d.delivery_title || wpMap[d.work_package_id] || d.description || "Delivery"} · {d.vendor} · {daysLate}d overdue
          </span>
        );
      })}
    </div>
  );
}
