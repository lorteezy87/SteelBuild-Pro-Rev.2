import React, { useEffect, useMemo, useState } from "react";

const CHECKLIST_ITEMS = [
  { key: "final_inspection_completed", label: "Final Inspection", icon: "✓" },
  { key: "punch_list_cleared", label: "Punchlist Cleared", icon: "☑" },
  { key: "all_invoices_processed", label: "Invoices Processed", icon: "$" },
  { key: "warranties_registered", label: "Warranties Registered", icon: "📋" },
  { key: "as_built_docs_completed", label: "As-Built Docs", icon: "📐" },
  { key: "permits_closed", label: "Permits Closed", icon: "🔐" },
];

export default function ProjectCloseoutChecklist({ closeout, onUpdate }) {
  const [draft, setDraft] = useState(closeout || {});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(closeout || {});
  }, [closeout]);

  const completedCount = useMemo(
    () => CHECKLIST_ITEMS.filter((item) => draft[item.key]).length,
    [draft]
  );
  const completionPercent = Math.round((completedCount / CHECKLIST_ITEMS.length) * 100);

  const syncUpdate = async (patch) => {
    if (!onUpdate) return;
    setIsSaving(true);
    try {
      await onUpdate({
        ...draft,
        ...patch,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleItem = async (itemKey) => {
    const nextValue = !draft[itemKey];
    const nextDraft = { ...draft, [itemKey]: nextValue };
    setDraft(nextDraft);

    const allComplete = CHECKLIST_ITEMS.every((item) =>
      item.key === itemKey ? nextValue : Boolean(nextDraft[item.key])
    );

    await syncUpdate({
      [itemKey]: nextValue,
      closeout_status: allComplete ? "Closed" : nextDraft.closeout_status || "In Progress",
    });
  };

  const updateStatus = async (status) => {
    setDraft((prev) => ({ ...prev, closeout_status: status }));
    await syncUpdate({ closeout_status: status });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Closeout Progress
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>
            {completionPercent}%
          </span>
        </div>
        <div style={{ height: 6, background: "var(--border-default)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg, var(--accent), var(--status-success))", width: `${completionPercent}%`, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: isSaving ? "var(--status-warning)" : "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {isSaving ? "Saving..." : `${completedCount}/${CHECKLIST_ITEMS.length} complete`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
              Status
            </span>
            <select
              value={draft.closeout_status || "In Progress"}
              onChange={(e) => updateStatus(e.target.value)}
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-default)",
                borderRadius: 4,
                padding: "5px 8px",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-primary)",
              }}
            >
              {["In Progress", "Approved", "Closed"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {CHECKLIST_ITEMS.map((item) => {
          const checked = Boolean(draft[item.key]);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => toggleItem(item.key)}
              style={{
                background: checked ? "var(--success-muted)" : "var(--bg-surface)",
                border: checked ? "1px solid var(--status-success)" : "1px solid var(--border-default)",
                borderLeft: `3px solid ${checked ? "var(--status-success)" : "var(--status-warning)"}`,
                borderRadius: 8,
                padding: 14,
                display: "flex",
                alignItems: "center",
                gap: 12,
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 18, width: 24, textAlign: "center", color: checked ? "var(--status-success)" : "var(--text-muted)" }}>
                {item.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{item.label}</div>
                <div style={{ fontSize: 9, color: checked ? "var(--status-success)" : "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
                  {checked ? "COMPLETE" : "PENDING"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 16 }}>
        <h3 style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px 0" }}>
          Key Dates
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {draft.completion_date && (
            <DateBlock label="Completion" value={draft.completion_date} tone="var(--text-primary)" />
          )}
          {draft.handover_date && (
            <DateBlock label="Handover" value={draft.handover_date} tone="var(--text-primary)" />
          )}
          {draft.client_sign_off_date && (
            <DateBlock label="Client Sign-Off" value={draft.client_sign_off_date} tone="var(--status-success)" />
          )}
          {draft.archive_date && (
            <DateBlock label="Archived" value={draft.archive_date} tone="var(--text-primary)" />
          )}
        </div>
      </div>
    </div>
  );
}

function DateBlock({ label, value, tone }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: tone }}>
        {new Date(value).toLocaleDateString()}
      </div>
    </div>
  );
}
