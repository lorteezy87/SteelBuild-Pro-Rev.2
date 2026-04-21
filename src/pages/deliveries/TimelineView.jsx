/**
 * TimelineView — 30-day horizontal timeline grouped by project. Each
 * project gets a row; deliveries render as colored chips in the day
 * column that matches their scheduled_date. A red vertical bar marks
 * "today" within the 30-day window.
 */

import React from "react";
import { STATUS_COLORS } from "./constants";
import { isSameDay } from "./utils";

export default function TimelineView({
  projectId,
  projectMap,
  wpMap,
  filtered,
  grouped,
  timelineDays,
  today,
  onSelect,
}) {
  const projectRows = projectId
    ? [{ name: projectMap[projectId] || "—", list: filtered }]
    : Object.entries(grouped || {}).map(([name, list]) => ({ name, list }));

  return (
    <div style={{ position: "relative", overflow: "auto", padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: `150px repeat(${timelineDays.length}, 48px)`, gap: 2, alignItems: "stretch" }}>
        <div />
        {timelineDays.map((d, i) => (
          <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center" }}>
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        ))}
        {projectRows.map((grp) => (
          <React.Fragment key={grp.name}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>{grp.name}</div>
            {timelineDays.map((day, idx) => {
              const dayDeliveries = grp.list.filter(
                (d) => d.scheduled_date && isSameDay(new Date(d.scheduled_date), day)
              );
              return (
                <div key={idx} style={{ position: "relative", minHeight: 38, border: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
                  {dayDeliveries.map((d, i2) => {
                    const colors = STATUS_COLORS[d.status] || STATUS_COLORS.Scheduled;
                    return (
                      <div
                        key={d.id}
                        title={`${d.delivery_title || wpMap[d.work_package_id] || d.description || d.vendor} · ${d.vendor}`}
                        style={{
                          position: "absolute",
                          top: 2 + i2 * 14,
                          left: 2,
                          right: 2,
                          height: 12,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 3,
                          fontSize: 9,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          padding: "0 4px",
                          color: colors.text,
                          cursor: "pointer",
                        }}
                        onClick={() => onSelect(d)}
                      >
                        {d.vendor} · {(d.weight_tons || 0) + "T"}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `calc(150px + ${timelineDays.findIndex((d) => isSameDay(d, today)) * 50}px)`,
          bottom: 0,
          width: 2,
          background: "var(--status-error)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
