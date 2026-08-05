import React from "react";
import { formatLocalDate } from "@/utils/dates";
import { presentCloseoutForUi } from "@/lib/closeout/closeoutPayload";

const CHECKLIST_ITEMS = [
  { key: "final_inspection_completed", label: "Final Inspection", icon: "✓" },
  { key: "punch_list_cleared", label: "Punchlist Cleared", icon: "☑" },
  { key: "all_invoices_processed", label: "Invoices Processed", icon: "💰" },
  { key: "warranties_registered", label: "Warranties Registered", icon: "📋" },
  { key: "as_built_docs_completed", label: "As-Built Docs", icon: "📐" },
  { key: "permits_closed", label: "Permits Closed", icon: "🔐" },
];

export default function ProjectCloseoutChecklist({ closeout, onUpdate, isUpdating = false }) {
  if (!closeout) return null;
  const view = presentCloseoutForUi(closeout);

  const completedCount = CHECKLIST_ITEMS.filter((item) => view[item.key]).length;
  const completionPercent = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);
  const status = view.closeout_status || "In Progress";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 600, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Closeout Progress</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>{completionPercent}%</span>
        </div>
        <div style={{ height: "6px", background: "var(--border-default)", borderRadius: "3px", overflow: "hidden" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg, var(--accent), var(--status-success))", width: `${completionPercent}%`, transition: "width 0.5s ease" }} />
        </div>
      </div>

      <div style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", background: `var(--${status === "Closed" ? "status-success" : status === "Approved" ? "status-info" : "status-warning"})20`, border: `1px solid var(--${status === "Closed" ? "status-success" : status === "Approved" ? "status-info" : "status-warning"})40`, borderRadius: "8px", width: "fit-content" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, color: `var(--${status === "Closed" ? "status-success" : status === "Approved" ? "status-info" : "status-warning"})`, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Status: {status}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
        {CHECKLIST_ITEMS.map((item) => {
          const isDone = !!view[item.key];
          return (
            <button
              type="button"
              key={item.key}
              aria-label={`${item.label}: ${isDone ? "done" : "not done"}`}
              disabled={!onUpdate || isUpdating}
              onClick={() => onUpdate?.({ [item.key]: !isDone })}
              style={{
                width: "100%",
                textAlign: "left",
                background: "var(--bg-surface)",
                border: isDone ? "1px solid var(--status-success)" : "1px solid var(--border-default)",
                borderRadius: "10px",
                padding: "14px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                transition: "all 0.15s",
                cursor: onUpdate && !isUpdating ? "pointer" : "not-allowed",
                opacity: isUpdating ? 0.65 : 1,
                color: "inherit",
              }}
            >
              <div style={{ fontSize: "20px" }}>{item.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</div>
                <div style={{ fontSize: "9px", color: isDone ? "var(--status-success)" : "var(--text-muted)", marginTop: "2px", fontFamily: "var(--font-mono)" }}>
                  {isDone ? "✓ DONE" : isUpdating ? "SAVING…" : "CLICK TO MARK DONE"}
                </div>
              </div>
              <div style={{ fontSize: "18px", color: isDone ? "var(--status-success)" : "var(--border-default)", transition: "color 0.15s" }}>
                {isDone ? "✓" : "○"}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "12px", padding: "16px" }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>Key Dates</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          {view.completion_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Completion</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{formatLocalDate(view.completion_date)}</div>
            </div>
          )}
          {view.handover_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Handover</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{formatLocalDate(view.handover_date)}</div>
            </div>
          )}
          {closeout.final_inspection_date && (
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px" }}>Final Inspection</div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--status-success)" }}>{formatLocalDate(closeout.final_inspection_date)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
