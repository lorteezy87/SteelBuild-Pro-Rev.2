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
  background: "linear-gradient(180deg, rgba(11,16,24,0.98) 0%, rgba(7,10,16,0.99) 100%)",
  border: "1px solid rgba(120, 138, 162, 0.22)",
  borderRadius: 16,
  boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
  color: "rgba(235,241,250,0.96)",
};

const controlSurfaceStyle = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(120, 138, 162, 0.22)",
  borderRadius: 8,
  color: "rgba(235,241,250,0.96)",
  fontFamily: "var(--font-body)",
  boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
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
        background: "rgba(2,6,23,0.72)",
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
        <div style={{ padding: "18px 20px 16px", borderBottom: "1px solid rgba(120, 138, 162, 0.18)" }}>
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
              color: "rgba(245,248,252,0.98)",
              marginTop: 4,
            }}
          >
            Apply changes to {count} submittal{count === 1 ? "" : "s"}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "rgba(176,190,210,0.82)",
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
                  color: "rgba(176,190,210,0.82)",
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
            borderTop: "1px solid rgba(120, 138, 162, 0.18)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <button
            onClick={reset}
            disabled={busy}
            style={{
              padding: "9px 14px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(120, 138, 162, 0.22)",
              borderRadius: 8,
              color: "rgba(214,223,235,0.9)",
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
              background: "linear-gradient(135deg, rgba(86,176,255,0.98) 0%, rgba(38,134,233,0.98) 100%)",
              color: "#04111f",
              border: "1px solid rgba(86,176,255,0.38)",
              borderRadius: 8,
              cursor: "pointer",
              boxShadow: "0 10px 24px rgba(17,113,190,0.28)",
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
          color: "rgba(176,190,210,0.76)",
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
              border: active ? "1px solid rgba(86,176,255,0.45)" : "1px solid rgba(120, 138, 162, 0.2)",
              background: active ? "rgba(86,176,255,0.16)" : "rgba(255,255,255,0.02)",
              color: active ? "rgba(144,205,255,0.98)" : "rgba(214,223,235,0.86)",
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
