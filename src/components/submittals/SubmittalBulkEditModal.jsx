import React, { useState } from "react";

/**
 * SubmittalBulkEditModal — apply the same field changes to many
 * submittals at once. Mirrors RfiBulkEditModal:
 *
 *   - Tri-state per field. Leaving a field blank means "don't touch
 *     it on any of the selected rows." Only fields the user explicitly
 *     edits are sent to the backend on submit.
 *   - Notes is special: instead of overwriting, the parent appends
 *     the new text to whatever notes a row already has, separated by
 *     a blank line. The append flag is sent through so the parent
 *     mutation knows to read-modify-write per row.
 *   - Date fields support an explicit CLEAR toggle so a user can
 *     unset a wrong required-date in bulk without entering a value.
 *
 * The fields covered (Status, BIC, Discipline, Required Date, Notes)
 * match the most-edited columns on the submittal log review pass,
 * which is when bulk edits get used in practice (e.g. moving a batch
 * of Submitted → Under Review after the architect picks them up).
 */

const STATUSES = [
  "Draft", "Submitted", "Under Review", "Approved", "Approved as Noted",
  "Revise and Resubmit", "Rejected", "Released for Fabrication", "Void",
];
// Bulk edit's BIC menu is wider than the page-level BIC filter on
// purpose — Subcontractor is a common reviewer for shop drawings even
// though it's not a recognized rolling-BIC state on the filter bar.
// Standardized across the submittal modals — see src/pages/Submittals.jsx
// for the canonical list and stage-mapping rationale.
const BIC_CHOICES = [
  "Detailer", "S&H", "Contractor", "Subcontractor",
  "EOR", "Architect", "AOR",
  "GC", "Owner",
];
const TYPES = ["Shop Drawing", "Product Data", "Sample", "Mock-up", "Calculation", "Other"];

export default function SubmittalBulkEditModal({ open, count, onCancel, onSubmit }) {
  // "" sentinel = leave unchanged. Each field has its own state so we
  // can detect "user explicitly cleared" vs. "user never touched it."
  const [status, setStatus] = useState("");
  const [bic, setBic] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [submittalType, setSubmittalType] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [clearRequiredDate, setClearRequiredDate] = useState(false);
  const [notesAppend, setNotesAppend] = useState("");

  const apply = () => {
    const data = {};
    if (status)        data.status = status;
    if (bic)           data.ball_in_court = bic;
    if (discipline)    data.discipline = discipline;
    if (submittalType) data.submittal_type = submittalType;
    if (clearRequiredDate)  data.required_date = null;
    else if (requiredDate)  data.required_date = requiredDate;

    // Notes append signals to the parent that we want a per-row
    // read-modify-write, not a flat overwrite. The parent's mutation
    // looks for `__notes_append` and pulls each row's existing
    // notes off the cache before patching. Sending the literal
    // patch field would clobber every row's history.
    const meta = {};
    if (notesAppend.trim()) meta.__notes_append = notesAppend.trim();

    if (Object.keys(data).length === 0 && Object.keys(meta).length === 0) {
      onCancel();
      return;
    }
    onSubmit({ ...data, ...meta });
  };

  const reset = () => {
    setStatus(""); setBic(""); setDiscipline(""); setSubmittalType("");
    setRequiredDate(""); setClearRequiredDate(false); setNotesAppend("");
    onCancel();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bulk edit ${count} submittals`}
      style={{
        position: "fixed", inset: 0, background: "rgba(2,6,23,0.55)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={reset}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "92vw", maxHeight: "92vh", overflowY: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)", borderRadius: 4,
          boxShadow: "var(--shadow-lg)", color: "var(--text-primary)",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase" }}>
            Bulk Edit
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
            Apply changes to {count} submittal{count === 1 ? "" : "s"}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Leave any field blank to skip. Only the fields you touch will be updated.
          </div>
        </div>

        <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Status">
            <Pills options={STATUSES} value={status} onChange={setStatus} />
          </Field>
          <Field label="Ball in court">
            <Pills options={BIC_CHOICES} value={bic} onChange={setBic} />
          </Field>
          <Field label="Discipline">
            <input
              type="text"
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              placeholder="Structural"
              style={{
                width: "100%", padding: "6px 10px", fontSize: 12,
                background: "var(--bg-input, var(--bg-surface-low))",
                border: "1px solid var(--border-default)", borderRadius: 3,
                color: "var(--text-primary)", fontFamily: "var(--font-body)",
              }}
            />
          </Field>
          <Field label="Type">
            <Pills options={TYPES} value={submittalType} onChange={setSubmittalType} />
          </Field>
          <Field label="Required date">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => { setRequiredDate(e.target.value); setClearRequiredDate(false); }}
                disabled={clearRequiredDate}
                style={{ flex: 1, padding: "6px 8px", fontSize: 12, color: "var(--text-primary)" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={clearRequiredDate}
                  onChange={(e) => { setClearRequiredDate(e.target.checked); if (e.target.checked) setRequiredDate(""); }}
                  style={{ margin: 0 }}
                />
                CLEAR
              </label>
            </div>
          </Field>
          <Field label="Append note">
            <textarea
              rows={3}
              value={notesAppend}
              onChange={(e) => setNotesAppend(e.target.value)}
              placeholder="Appended (with separator) — does not overwrite existing notes."
              style={{
                width: "100%", padding: "6px 10px", fontSize: 12, resize: "vertical",
                background: "var(--bg-input, var(--bg-surface-low))",
                border: "1px solid var(--border-default)", borderRadius: 3,
                color: "var(--text-primary)", fontFamily: "var(--font-body)",
              }}
            />
          </Field>
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "flex-end", gap: 8, background: "var(--bg-surface-low)" }}>
          <button
            onClick={reset}
            style={{
              padding: "8px 14px", background: "transparent", border: "1px solid var(--border-default)",
              borderRadius: 4, color: "var(--text-secondary)", cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={apply}
            style={{
              padding: "8px 14px", background: "var(--accent)", color: "#fff",
              border: "none", borderRadius: 4, cursor: "pointer",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            }}
          >
            APPLY TO {count}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Pills({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? "" : opt)}
            style={{
              padding: "4px 10px", borderRadius: 3,
              border: active ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              background: active ? "var(--accent-muted)" : "transparent",
              color: active ? "var(--accent)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              cursor: "pointer",
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
