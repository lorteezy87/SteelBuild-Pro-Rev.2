import React from "react";

export default function ProjectCloseoutChecklist({ closeout, onUpdate }) {
  if (!closeout) return null;

  const items = [
    { key: "final_inspection_completed", label: "Final Inspection", icon: "✓" },
    { key: "punch_list_cleared", label: "Punchlist Cleared", icon: "☑" },
    { key: "all_invoices_processed", label: "Invoices Processed", icon: "💰" },
    { key: "warranties_registered", label: "Warranties Registered", icon: "📋" },
    { key: "as_built_docs_completed", label: "As-Built Docs", icon: "📐" },
    { key: "permits_closed", label: "Permits Closed", icon: "🔐" },
  ];

  const completedCount = items.filter((i) => closeout[i.key]).length;
  const completionPercent = Math.round((completedCount / items.length) * 100);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Progress */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Closeout Progress</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>{completionPercent}%</span>
        </div>
        <div style={{ height: "6px", background: "var(--border-default)", borderRadius: "3px", overflow: "hidden" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg, var(--accent), var(--status-success))", width: `${completionPercent}%`, transition: "width 0.5s ease" }} />
        </div>
      </div>

      {/* Status Badge */}
      <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", background: `var(--${closeout.closeout_status === "Closed" ? "status-success" : closeout.closeout_status === "Approved" ? "status-info" : "status-warning"})20`, border: `1px solid var(--${closeout.closeout_status === "Closed" ? "status-success" : closeout.closeout_status === "Approved" ? "status-info" : "status-warning"})40`, borderRadius: "8px", width: "fit-content" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, color: `var(--${closeout.closeout_status === "Closed" ? "status-success" : closeout.closeout_status === "Approved" ? "status-info" : "status-warning"})`, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Status: {closeout.closeout_status}
        </span>
      </div>

      {/* Checklist Items */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        {items.map((item) => {
          const isDone = !!closeout[item.key];
          return (
            <div
              key={item.key}
              onClick={() => onUpdate && onUpdate({ ...closeout, [item.key]: !isDone })}
              style={{
                background: "var(--bg-surface)",
                border: isDone ? "1px solid var(--status-success)" : "1px solid var(--border-default)",
                borderRadius: "10px",
                padding: "14px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s",
                cursor: onUpdate ? "pointer" : "default",
                opacity: 1,
              }}
            >
              <div style={{ fontSize: "20px" }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</div>
                <div style={{ fontSize: "9px", color: isDone ? "var(--status-success)" : "var(--text-muted)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                  {isDone ? "✓ DONE" : "CLICK TO MARK DONE"}
                </div>
              </div>
              <div style={{ fontSize: "18px", color: isDone ? "var(--status-success)" : "var(--border-default)", transition: "color 0.15s" }}>
                {isDone ? "✓" : "○"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Key Dates */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>Key Dates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          {closeout.completion_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Completion</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{new Date(closeout.completion_date).toLocaleDateString()}</div>
            </div>
          )}
          {closeout.handover_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Handover</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{new Date(closeout.handover_date).toLocaleDateString()}</div>
            </div>
          )}
          {closeout.client_sign_off_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Client Sign-Off</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--status-success)" }}>{new Date(closeout.client_sign_off_date).toLocaleDateString()}</div>
            </div>
          )}
          {closeout.archive_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Archived</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{new Date(closeout.archive_date).toLocaleDateString()}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}