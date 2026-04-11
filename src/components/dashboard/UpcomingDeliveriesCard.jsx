import React from "react";
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
  ].slice(0, 8);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Upcoming Deliveries</span>
          {late.length > 0 && (
            <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{late.length} LATE</span>
          )}
        </div>
        <button onClick={() => navigate(createPageUrl("Deliveries"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>ALL →</button>
      </div>

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5, overflowY: "auto", maxHeight: 280 }}>
        {allShown.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>NO UPCOMING DELIVERIES</div>
        ) : allShown.map(d => {
          const borderColor = d.isLate ? "var(--status-error)" : "var(--accent)";
          const bgColor = d.isLate ? "var(--danger-muted)" : "var(--accent-muted)";
          return (
            <div key={d.id} style={{ padding: "8px 10px", borderLeft: `3px solid ${borderColor}`, background: bgColor, borderRadius: "0 6px 6px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                {d.isLate && <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--status-error)", letterSpacing: "0.12em", marginBottom: 2, fontWeight: 700 }}>LATE</div>}
                <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{d.delivery_title || d.vendor}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 1 }}>{d.delivery_title ? d.vendor : ""}{d.weight_tons ? `${d.delivery_title ? " · " : ""}${d.weight_tons}T` : ""}{d.pieces ? ` · ${d.pieces} pcs` : ""}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right", marginLeft: 10 }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: borderColor, fontWeight: 700 }}>{formatDate(d.scheduled_date)}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 2 }}>{d.status}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}