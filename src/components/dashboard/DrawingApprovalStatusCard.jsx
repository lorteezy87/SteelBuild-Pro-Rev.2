import React from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { daysOverdue, isOverdue } from "../shared/formatters";

export default function DrawingApprovalStatusCard({ drawings = [] }) {
  const navigate = useNavigate();

  const total = drawings.length;
  // Corrected 7-stage flow (migration 077): Not Started → IFA → OFA → BFA
  // → OFS → IFC → Released. R&R outcomes loop back to IFA.
  const notStarted = drawings.filter(d => d.stage === "Not Started").length;
  const ifa = drawings.filter(d => d.stage === "IFA").length;
  const ofa = drawings.filter(d => d.stage === "OFA").length;
  const bfa = drawings.filter(d => d.stage === "BFA").length;
  const ofs = drawings.filter(d => d.stage === "OFS").length;
  const ifc = drawings.filter(d => d.stage === "IFC").length;
  const released = drawings.filter(d => d.stage === "Released").length;
  const overdue = drawings.filter(d => isOverdue(d.due_date, d.stage, ["Released"])).length;

  const pendingApproval = ifa + ofa + bfa;

  const stages = [
    { label: "Not Started",         count: notStarted, color: "var(--text-muted)" },
    { label: "IFA — In For Approval",   count: ifa,    color: "#60A5FA" },
    { label: "OFA — Out For Approval",  count: ofa,    color: "var(--status-warning)" },
    { label: "BFA — Back From Approval",count: bfa,    color: "var(--chart-3)" },
    { label: "OFS — Out For Scrub",     count: ofs,    color: "var(--chart-4)" },
    { label: "IFC — Issued For Construction", count: ifc, color: "#34D399" },
    { label: "Released",                count: released, color: "var(--status-success)" },
  ];

  const overdueDrawings = drawings
    .filter(d => isOverdue(d.due_date, d.stage, ["Released"]))
    .sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date))
    .slice(0, 4);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--chart-4)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Drawings & Approvals</span>
          {overdue > 0 && (
            <span style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{overdue} OVERDUE</span>
          )}
        </div>
        <button onClick={() => navigate(createPageUrl("Drawings"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--chart-4)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>LOG →</button>
      </div>

      <div style={{ padding: "12px 16px" }}>
        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: "Total Sheets", value: total, color: "var(--text-primary)" },
            { label: "Pending Approval", value: pendingApproval, color: pendingApproval > 0 ? "var(--status-warning)" : "var(--text-secondary)" },
            { label: "Released", value: released, color: released > 0 ? "var(--status-success)" : "var(--text-muted)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: "center", padding: "8px 6px", background: "var(--bg-hover)", borderRadius: 6 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Stage breakdown */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {stages.filter(s => s.count > 0).map(s => {
            const pct = total > 0 ? Math.round(s.count / total * 100) : 0;
            return (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", flex: 1 }}>{s.label}</span>
                <div style={{ width: 60, height: 4, background: "var(--border-default)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: s.color, borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: s.color, fontWeight: 700, minWidth: 20, textAlign: "right" }}>{s.count}</span>
              </div>
            );
          })}
          {total === 0 && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>NO DRAWINGS</div>}
        </div>

        {/* Overdue items */}
        {overdueDrawings.length > 0 && (
          <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>Overdue Returns</div>
            {overdueDrawings.map(d => (
              <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderLeft: "2px solid var(--status-error)", marginBottom: 4, background: "var(--danger-muted)", borderRadius: "0 4px 4px 0" }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", fontWeight: 700, marginRight: 6 }}>{d.sheet_number}</span>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--status-error)", fontWeight: 700, flexShrink: 0, marginLeft: 6 }}>{daysOverdue(d.due_date)}d</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}