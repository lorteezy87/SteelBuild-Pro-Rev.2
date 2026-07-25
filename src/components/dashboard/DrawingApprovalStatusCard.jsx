import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { daysOverdue, isOverdue } from "../shared/formatters";
import { submittalPipelineRollupFromSubmittals } from "@/pages/dashboard/projectMetrics";

/**
 * DrawingApprovalStatusCard — dashboard SoT for approval pipeline (Slice 9).
 * Prefer submittal-derived stages (incl. R&R). Falls back to sheet-stage
 * counts only when no submittals are provided (legacy callers).
 */
export default function DrawingApprovalStatusCard({ drawings = [], submittals = [] }) {
  const navigate = useNavigate();

  const rollup = useMemo(
    () => (submittals?.length ? submittalPipelineRollupFromSubmittals(submittals) : null),
    [submittals],
  );
  const counts = rollup?.counts ?? null;

  const total = rollup ? rollup.total : drawings.length;
  const notStarted = counts
    ? 0
    : drawings.filter((d) => d.stage === "Not Started").length;
  const ifa = counts ? counts.IFA : drawings.filter((d) => d.stage === "IFA").length;
  const ofa = counts ? counts.OFA : drawings.filter((d) => d.stage === "OFA").length;
  const bfa = counts ? counts.BFA : drawings.filter((d) => d.stage === "BFA").length;
  const rr = counts ? counts["R&R"] : 0;
  const ofs = counts ? counts.OFS : drawings.filter((d) => d.stage === "OFS").length;
  const ifc = counts ? counts.IFC : drawings.filter((d) => d.stage === "IFC").length;
  const released = counts
    ? counts.Released
    : drawings.filter((d) => d.stage === "Released").length;
  const overdue = drawings.filter((d) => isOverdue(d.due_date, d.stage, ["Released", "IFC"])).length;

  const pendingApproval = ifa + ofa + bfa + rr;

  const stages = [
    { label: "Not Started", count: notStarted, color: "var(--text-muted)" },
    { label: "IFA — In For Approval", count: ifa, color: "#60A5FA" },
    { label: "OFA — Out For Approval", count: ofa, color: "var(--status-warning)" },
    { label: "BFA — Back From Approval", count: bfa, color: "var(--chart-3)" },
    { label: "R&R — Revise and Resubmit", count: rr, color: "#F59E0B" },
    { label: "OFS — Out For Scrub", count: ofs, color: "var(--chart-4)" },
    { label: "IFC — Issued For Construction", count: ifc, color: "#34D399" },
    { label: "Released", count: released, color: "var(--status-success)" },
  ];

  const overdueDrawings = drawings
    .filter((d) => isOverdue(d.due_date, d.stage, ["Released", "IFC"]))
    .sort((a, b) => daysOverdue(b.due_date) - daysOverdue(a.due_date))
    .slice(0, 4);

  return (
    <div className="sbd-card" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden", height: "100%", padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 16, background: "var(--chart-4)", borderRadius: 2 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.10em", textTransform: "uppercase" }}>Drawings & Approvals</span>
          {overdue > 0 && (
            <span className="sbd-badge sbd-badge-error" style={{ background: "var(--danger-muted)", border: "1px solid var(--danger-border)", color: "var(--status-error)", borderRadius: 4, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{overdue} OVERDUE</span>
          )}
        </div>
        <button type="button" onClick={() => navigate(createPageUrl("Drawings"))} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--chart-4)", background: "none", border: "none", cursor: "pointer", letterSpacing: "0.10em", fontWeight: 600 }}>LOG →</button>
      </div>

      <div style={{ padding: "12px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
          {[
            { label: rollup ? "Active Packages" : "Total Sheets", value: total, color: "var(--text-primary)" },
            { label: "Pending Approval", value: pendingApproval, color: pendingApproval > 0 ? "var(--status-warning)" : "var(--text-secondary)" },
            { label: "IFC / Released", value: ifc + released, color: ifc + released > 0 ? "var(--status-success)" : "var(--text-muted)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="sbd-kpi" style={{ textAlign: "center", padding: "8px 6px", background: "var(--bg-hover)", borderRadius: 6 }}>
              <div className="sbd-kpi-value sbd-num" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 3 }}>{value}</div>
              <div className="sbd-kpi-label" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", margin: 0 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {stages.filter((s) => s.count > 0).map((s) => {
            const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
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
        </div>

        {overdueDrawings.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: 10 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", letterSpacing: "0.08em", marginBottom: 6 }}>OVERDUE SHEETS</div>
            {overdueDrawings.map((d) => (
              <div key={d.id || d.sheet_number} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>
                {d.sheet_number || "—"} · {daysOverdue(d.due_date)}d late
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
