/**
 * LookaheadPanel — left-side 7-day calendar + 30-day queue panel.
 *
 * Hidden (width 0) when there are zero deliveries so the empty state
 * can fill the full content area. Click a day's delivery → open
 * detail drawer via `onSelect`.
 */

import React from "react";
import { StatusPill } from "./subcomponents";
import { STATUS_COLORS } from "./constants";
import { isSameDay } from "./utils";

export default function LookaheadPanel({
  deliveries,
  projectMap,
  wpMap,
  today,
  in7,
  in30,
  dayList,
  hidden,
  onSelect,
}) {
  return (
    <div
      style={{
        width: hidden ? 0 : 260,
        flexShrink: 0,
        borderRight: hidden ? "none" : "1px solid var(--divider)",
        background: "var(--bg-surface-low)",
        overflowY: "auto",
        overflow: hidden ? "hidden" : undefined,
        transition: "width 0.2s ease",
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--divider)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
          7-DAY LOOKAHEAD
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>
          {today.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {in7.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      </div>

      {dayList.map((day, idx) => {
        const dayDeliveries = deliveries.filter(
          (d) => d.scheduled_date && isSameDay(new Date(d.scheduled_date), day) && d.status !== "Delivered"
        );
        const isToday = isSameDay(day, today);
        return (
          <div key={idx}>
            <div
              style={{
                padding: "6px 16px",
                background: isToday ? "var(--accent-muted)" : "var(--bg-surface-low)",
                borderBottom: "1px solid var(--divider)",
                borderTop: idx === 0 ? "none" : "1px solid var(--divider)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: isToday ? "var(--accent)" : "var(--text-primary)",
                }}
              >
                {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} {day.getDate()}
              </span>
              {dayDeliveries.length > 0 && (
                <span style={{ background: "var(--accent-muted)", color: "var(--accent)", padding: "1px 6px", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 8 }}>
                  {dayDeliveries.length}
                </span>
              )}
            </div>
            {dayDeliveries.length === 0 ? (
              <div style={{ padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>
                — none
              </div>
            ) : (
              dayDeliveries.map((d) => {
                const colors = STATUS_COLORS[d.status] || STATUS_COLORS.Scheduled;
                const isLate = new Date(d.scheduled_date) < today && d.status !== "Delivered";
                return (
                  <div
                    key={d.id}
                    onClick={() => onSelect(d)}
                    style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid var(--divider)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 3,
                      borderLeft: `3px solid ${colors.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {d.vendor}
                      </span>
                      <StatusPill status={d.status} />
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {d.description || wpMap[d.work_package_id] || "—"}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                      {d.pieces || 0} pcs · {d.weight_tons || 0}T · {projectMap[d.project_id] || ""}
                      {isLate && (
                        <span style={{ marginLeft: 6, color: "var(--status-error)" }}>
                          {Math.ceil((today - new Date(d.scheduled_date)) / 86400000)}d late
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--divider)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
        NEXT 30 DAYS
      </div>
      {deliveries
        .filter((d) => {
          if (!d.scheduled_date) return false;
          const dt = new Date(d.scheduled_date);
          return dt > in7 && dt <= in30 && d.status !== "Delivered";
        })
        .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
        .map((d) => (
          <div key={d.id} style={{ padding: "6px 16px", borderBottom: "1px solid var(--divider)", fontSize: 10, color: "var(--text-primary)" }}>
            {new Date(d.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {d.vendor} · {d.description || wpMap[d.work_package_id] || "—"} · {d.weight_tons || 0}T
          </div>
        ))}
    </div>
  );
}
