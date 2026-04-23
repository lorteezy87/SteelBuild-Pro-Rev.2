import React, { useState } from "react";

/**
 * RfiBulkEditModal — apply the same field changes to many RFIs at once.
 *
 * Prior to this the bulk-action bar only supported "mark answered" and
 * "mark under review" buttons. This modal surfaces the full common-edit
 * set — priority, ball-in-court, required date, discipline — and sends
 * each as an update via the existing bulkUpdateMut mutation.
 *
 * Pattern choice: plain fixed overlay (no Radix Dialog). Each field
 * has a tri-state "leave unchanged / set to X" control so a user can
 * change just one thing without clobbering the other fields on every
 * selected RFI. Only fields the user explicitly edits are sent on submit.
 */

const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const STATUSES = ["Open", "Under Review", "Answered", "Closed"];
const BIC_CHOICES = ["Contractor", "EOR", "Architect", "GC", "Owner"];

export default function RfiBulkEditModal({ open, count, onCancel, onSubmit }) {
  // "unchanged" sentinel lets us send a subset of fields on submit.
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [bic, setBic] = useState("");
  const [dateRequired, setDateRequired] = useState("");
  const [clearDateRequired, setClearDateRequired] = useState(false);

  const apply = () => {
    const data = {};
    if (priority) data.priority = priority;
    if (status) data.status = status;
    if (bic) data.ball_in_court = bic;
    if (clearDateRequired) data.date_required = null;
    else if (dateRequired) data.date_required = dateRequired;
    if (Object.keys(data).length === 0) {
      onCancel();
      return;
    }
    onSubmit(data);
  };

  const reset = () => {
    setPriority(""); setStatus(""); setBic(""); setDateRequired(""); setClearDateRequired(false);
    onCancel();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bulk edit ${count} RFIs`}
      style={{
        position: "fixed", inset: 0, background: "rgba(2,6,23,0.55)", backdropFilter: "blur(4px)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={reset}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520, maxWidth: "92vw", background: "var(--bg-surface)",
          border: "1px solid var(--border-default)", borderRadius: 4,
          boxShadow: "var(--shadow-lg)", color: "var(--text-primary)",
        }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: "var(--accent)", textTransform: "uppercase" }}>
            Bulk Edit
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 800, color: "var(--text-primary)", marginTop: 2 }}>
            Apply changes to {count} RFI{count === 1 ? "" : "s"}
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            Leave any field blank to skip. Only the fields you touch will be updated.
          </div>
        </div>

        <div style={{ padding: "14px 18px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Priority">
            <Pills
              options={PRIORITIES}
              value={priority}
              onChange={setPriority}
            />
          </Field>
          <Field label="Status">
            <Pills
              options={STATUSES}
              value={status}
              onChange={setStatus}
            />
          </Field>
          <Field label="Ball in court">
            <Pills
              options={BIC_CHOICES}
              value={bic}
              onChange={setBic}
            />
          </Field>
          <Field label="Required date">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="date"
                value={dateRequired}
                onChange={(e) => { setDateRequired(e.target.value); setClearDateRequired(false); }}
                disabled={clearDateRequired}
                style={{ flex: 1, padding: "6px 8px", fontSize: 12, color: "var(--text-primary)" }}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={clearDateRequired}
                  onChange={(e) => { setClearDateRequired(e.target.checked); if (e.target.checked) setDateRequired(""); }}
                  style={{ margin: 0 }}
                />
                CLEAR
              </label>
            </div>
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
