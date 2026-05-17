import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { formatDate } from "../shared/formatters";

export default function UpcomingDeliveriesCard({ deliveries = [] }) {
  const navigate = useNavigate();
  const today = new Date(); today.setHours(0,0,0,0);
  const threeWeeks = new Date(today.getTime() + 21 * 86400000);

  const late = deliveries.filter(d => d.scheduled_date && new Date(d.scheduled_date + "T00:00:00") < today && d.status !== "Delivered")
    .sort((a, b) => new Date(a.scheduled_date + "T00:00:00") - new Date(b.scheduled_date + "T00:00:00"));
  const upcoming = deliveries.filter(d => d.scheduled_date && new Date(d.scheduled_date + "T00:00:00") >= today && new Date(d.scheduled_date + "T00:00:00") <= threeWeeks && d.status !== "Delivered")
    .sort((a, b) => new Date(a.scheduled_date + "T00:00:00") - new Date(b.scheduled_date + "T00:00:00"));

  const allShown = [
    ...late.map(d => ({ ...d, isLate: true })),
    ...upcoming.map(d => ({ ...d, isLate: false })),
  ].slice(0, 12);

  // Group deliveries by date for compact display
  const grouped = useMemo(() => {
    const groups = {};
    allShown.forEach(d => {
      const dateKey = d.scheduled_date || "Unknown";
      if (!groups[dateKey]) groups[dateKey] = { date: dateKey, items: [], totalTons: 0, isLate: d.isLate };
      groups[dateKey].items.push(d);
      groups[dateKey].totalTons += Number(d.weight_tons) || 0;
      if (d.isLate) groups[dateKey].isLate = true;
    });
    return Object.values(groups);
  }, [allShown]);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Upcoming Deliveries</span>
          {late.length > 0 && (
            <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{late.length} LATE</span>
          )}
        </div>
        <button onClick={() => navigate(createPageUrl("Deliveries"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>ALL \u2192</button>
      </div>

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 280 }}>
        {grouped.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>NO UPCOMING DELIVERIES</div>
        ) : grouped.map(group => {
          const borderColor = group.isLate ? "var(--status-error)" : "var(--accent)";
          const bgColor = group.isLate ? "var(--danger-muted)" : "var(--bg-surface-low)";
          return (
            <div key={group.date} style={{
              borderLeft: `3px solid ${borderColor}`,
              background: bgColor,
              borderRadius: "0 8px 8px 0",
              padding: "8px 10px",
            }}>
              {/* Date header with daily totals */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: group.items.length > 1 ? 6 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {group.isLate && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", letterSpacing: "0.12em", fontWeight: 700 }}>LATE</span>}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: borderColor, fontWeight: 700 }}>{formatDate(group.date)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)", fontWeight: 600 }}>
                    {group.items.length === 1 ? "1 truck" : `${group.items.length} trucks`}
                  </span>
                  {group.totalTons > 0 && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: borderColor, fontWeight: 700 }}>
                      {Math.round(group.totalTons)}T
                    </span>
                  )}
                </div>
              </div>
              {/* Individual deliveries within group */}
              {group.items.length === 1 ? (
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {group.items[0].description || group.items[0].vendor}
                  {group.items[0].weight_tons ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginLeft: 6 }}>{group.items[0].weight_tons}T</span> : null}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {group.items.map(d => (
                    <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {d.description || d.vendor}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flexShrink: 0, marginLeft: 8 }}>
                        {d.weight_tons ? `${d.weight_tons}T` : ""}{d.pieces ? ` · ${d.pieces}pcs` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
