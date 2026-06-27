import React from "react";

export default function ProjectCloseoutSummary({ closeout }) {
  if (!closeout) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
      {closeout.final_cost !== null && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Final Cost</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--accent)", marginBottom: "4px" }}>${(closeout.final_cost || 0).toLocaleString()}</div>
          {closeout.cost_variance !== null && (
            <div style={{ fontSize: "10px", color: closeout.cost_variance > 0 ? "var(--status-success)" : "var(--status-warning)" }}>
              {closeout.cost_variance > 0 ? "✓" : "−"} ${Math.abs(closeout.cost_variance || 0).toLocaleString()} variance
            </div>
          )}
        </div>
      )}

      {closeout.schedule_variance_days !== null && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Schedule Variance</div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: closeout.schedule_variance_days > 0 ? "var(--status-success)" : "var(--status-warning)", marginBottom: "4px" }}>
            {Math.abs(closeout.schedule_variance_days || 0)} days
          </div>
          <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
            {closeout.schedule_variance_days > 0 ? "Early" : closeout.schedule_variance_days < 0 ? "Late" : "On Schedule"}
          </div>
        </div>
      )}

      {closeout.client_signed_by && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--success-border)", borderRadius: "12px", padding: "16px", borderLeft: "3px solid var(--status-success)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--status-success)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>✓ Client Sign-Off</div>
          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>{closeout.client_signed_by}</div>
          {closeout.client_sign_off_date && (
            <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Signed {new Date(closeout.client_sign_off_date).toLocaleDateString()}</div>
          )}
        </div>
      )}

      {closeout.archive_location && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "8px" }}>Archive Location</div>
          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{closeout.archive_location}</div>
        </div>
      )}
    </div>
  );
}