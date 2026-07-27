import React, { useState } from "react";

const STATUSES = [
  "Draft",
  "Submitted",
  "Under Review",
  "Approved",
  "Approved as Noted",
  "Revise and Resubmit",
  "Rejected",
  "Released for Fabrication",
  "Void",
];

const BIC_CHOICES = [
  "Detailer",
  "S&H",
  "Contractor",
  "Subcontractor",
  "EOR",
  "Architect",
  "AOR",
  "GC",
  "Owner",
];

const TYPES = ["Shop Drawing", "Product Data", "Sample", "Mock-up", "Calculation", "Other"];

const modalSurfaceStyle = {
  background: "linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface-low) 100%)",
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  boxShadow: "0 32px 80px color-mix(in srgb, var(--bg-base) 55%, transparent), 0 0 0 1px var(--bg-hover) inset",
  color: "var(--text-primary)",
};

const controlSurfaceStyle = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 12,
  background: "var(--bg-hover)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  boxShadow: "0 1px 0 var(--hover-bg) inset",
  colorScheme: "dark",
};

export default function SubmittalBulkEditModal({ open, count, onCancel, onSubmit, busy = false }) {
  const [status, setStatus] = useState("");
  const [bic, setBic] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [submittalType, setSubmittalType] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [clearRequiredDate, setClearRequiredDate] = useState(false);
  const [notesAppend, setNotesAppend] = useState("");

  const apply = () => {
    if (busy) return;
    const data = {};
    if (status) data.status = status;
    if (bic) data.ball_in_court = bic;
    if (discipline) data.discipline = discipline;
    if (submittalType) data.submittal_type = submittalType;
    if (clearRequiredDate) data.required_date = null;
    else if (requiredDate) data.required_date = requiredDate;

    const meta = {};
    if (notesAppend.trim()) meta.__notes_append = notesAppend.trim();

    if (Object.keys(data).length === 0 && Object.keys(meta).length === 0) {
      onCancel();
      return;
    }

    onSubmit({ ...data, ...meta });
  };

  const reset = () => {
    if (busy) return;
    setStatus("");
    setBic("");
    setDiscipline("");
    setSubmittalType("");
    setRequiredDate("");
    setClearRequiredDate(false);
    setNotesAppend("");
    onCancel();
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Bulk edit ${count} submittals`}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--bg-base) 72%, transparent)",
        backdropFilter: "blur(10px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={reset}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: "92vw",
          maxHeight: "92vh",
          overflowY: "auto",
          ...modalSurfaceStyle,
        }}
      >
        <div style={{ padding: "18px 20px 16px", borderBottom: "1px solid var(--divider)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--accent)",
              textTransform: "uppercase",
            }}
          >
            Bulk Edit
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              fontWeight: 800,
              color: "var(--text-primary)",
              marginTop: 4,
            }}
          >
            Apply changes to {count} submittal{count === 1 ? "" : "s"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--text-secondary)",
              marginTop: 6,
            }}
          >
            Leave any field blank to skip. Only the fields you touch will be updated.
          </div>
        </div>

        <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
              style={controlSurfaceStyle}
            />
          </Field>
          <Field label="Type">
            <Pills options={TYPES} value={submittalType} onChange={setSubmittalType} />
          </Field>
          <Field label="Required date">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="date"
                value={requiredDate}
                onChange={(e) => {
                  setRequiredDate(e.target.value);
                  setClearRequiredDate(false);
                }}
                disabled={clearRequiredDate}
                style={{
                  ...controlSurfaceStyle,
                  flex: 1,
                  opacity: clearRequiredDate ? 0.5 : 1,
                }}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                }}
              >
                <input
                  type="checkbox"
                  checked={clearRequiredDate}
                  onChange={(e) => {
                    setClearRequiredDate(e.target.checked);
                    if (e.target.checked) setRequiredDate("");
                  }}
                  style={{ margin: 0, accentColor: "var(--accent)" }}
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
              placeholder="Appended with separator. Does not overwrite existing notes."
              style={{ ...controlSurfaceStyle, resize: "vertical", minHeight: 88 }}
            />
          </Field>
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--divider)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            background: "var(--hover-bg)",
          }}
        >
          <button
            onClick={reset}
            disabled={busy}
            style={{
              padding: "9px 14px",
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              color: "var(--text-primary)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={apply}
            disabled={busy}
            style={{
              padding: "9px 16px",
              background: "linear-gradient(135deg, var(--status-info) 0%, var(--status-info) 100%)",
              color: "var(--on-accent)",
              border: "1px solid var(--info-border)",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 10px 24px color-mix(in srgb, var(--status-info) 28%, transparent)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            {busy ? "APPLYING..." : `APPLY TO ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Pills({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((opt) => {
        const active = value === opt;

        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(active ? "" : opt)}
            style={{
              padding: "5px 10px",
              borderRadius: 999,
              border: active ? "1px solid var(--info-border)" : "1px solid var(--border-default)",
              background: active ? "var(--info-muted)" : "var(--bg-surface-low)",
              color: active ? "var(--status-info)" : "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.06em",
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
