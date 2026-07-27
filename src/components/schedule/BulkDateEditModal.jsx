import React, { useEffect, useMemo, useState } from "react";
import DateOrTbdInput from "./DateOrTbdInput";

const FIELD_STYLE = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 13,
  padding: "8px 10px",
  outline: "none",
};

const monoLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

function DateField({ label, enabled, mode, value, onEnabledChange, onModeChange, onValueChange }) {
  return (
    <section
      style={{
        border: "1px solid var(--border-default)",
        borderRadius: 14,
        background: enabled
          ? "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--bg-surface)) 0%, var(--bg-surface) 100%)"
          : "var(--bg-surface-low)",
        padding: 14,
        display: "grid",
        gap: 12,
      }}
    >
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          style={{ width: 16, height: 16, accentColor: "var(--accent)" }}
        />
        <span style={{ ...monoLabel, color: enabled ? "var(--text-primary)" : "var(--text-muted)" }}>
          Update {label}
        </span>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, opacity: enabled ? 1 : 0.45 }}>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onModeChange("date")}
          style={{
            borderRadius: 10,
            border: mode === "date" ? "1px solid var(--accent)" : "1px solid var(--border-default)",
            background: mode === "date" ? "var(--accent-muted)" : "var(--bg-surface)",
            color: mode === "date" ? "var(--accent)" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "8px 10px",
            cursor: enabled ? "pointer" : "not-allowed",
          }}
        >
          SET DATE
        </button>
        <button
          type="button"
          disabled={!enabled}
          onClick={() => onModeChange("tbd")}
          style={{
            borderRadius: 10,
            border: mode === "tbd" ? "1px solid var(--status-warning)" : "1px solid var(--border-default)",
            background: mode === "tbd" ? "var(--warning-muted)" : "var(--bg-surface)",
            color: mode === "tbd" ? "var(--status-warning)" : "var(--text-secondary)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "8px 10px",
            cursor: enabled ? "pointer" : "not-allowed",
          }}
        >
          MARK TBD
        </button>
      </div>

      {mode === "date" ? (
        <DateOrTbdInput
          value={value}
          onChange={onValueChange}
          inputStyle={FIELD_STYLE}
        />
      ) : (
        <div
          style={{
            border: "1px dashed var(--status-warning)",
            borderRadius: 10,
            padding: "9px 10px",
            color: "var(--status-warning)",
            background: "var(--warning-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            opacity: enabled ? 1 : 0.5,
          }}
        >
          TBD - CLEARS THE STORED DATE
        </div>
      )}
    </section>
  );
}

export default function BulkDateEditModal({ open, count = 0, isSaving = false, onClose, onSubmit }) {
  const [updateStart, setUpdateStart] = useState(false);
  const [updateEnd, setUpdateEnd] = useState(false);
  const [startMode, setStartMode] = useState("date");
  const [endMode, setEndMode] = useState("date");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setUpdateStart(false);
    setUpdateEnd(false);
    setStartMode("date");
    setEndMode("date");
    setStartDate("");
    setEndDate("");
  }, [open]);

  const validation = useMemo(() => {
    if (!updateStart && !updateEnd) return "Choose at least one date field to update.";
    if (updateStart && startMode === "date" && !startDate) return "Choose a start date or mark start as TBD.";
    if (updateEnd && endMode === "date" && !endDate) return "Choose an end date or mark end as TBD.";
    return "";
  }, [endDate, endMode, startDate, startMode, updateEnd, updateStart]);

  const handleSubmit = () => {
    if (validation || isSaving) return;
    const fields = {};
    if (updateStart) fields.start_date = startMode === "tbd" ? null : startDate;
    if (updateEnd) fields.end_date = endMode === "tbd" ? null : endDate;
    onSubmit(fields);
  };

  if (!open) return null;

  return (
    <>
      <div
        onClick={isSaving ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "color-mix(in srgb, var(--sbd-gantt-bg) 70%, transparent)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 998,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk edit task dates"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(620px, 94vw)",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 96%, var(--sbd-gantt-bg) 4%) 0%, var(--bg-surface-low) 100%)",
          border: "1px solid var(--accent-border)",
          borderRadius: 18,
          boxShadow: "var(--shadow-lg)",
          color: "var(--text-primary)",
          zIndex: 999,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "18px 22px 14px",
            borderBottom: "1px solid var(--divider)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ ...monoLabel, color: "var(--accent)" }}>Schedule Bulk Edit</div>
            <h2 style={{ margin: "4px 0 0", fontSize: 22, lineHeight: 1.1, fontWeight: 800 }}>
              Start / End Dates
            </h2>
            <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.45 }}>
              Applies to selected detail tasks. Summary rows keep rolling up from their child tasks.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close bulk date editor"
            style={{
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-muted)",
              borderRadius: 10,
              width: 34,
              height: 34,
              cursor: isSaving ? "not-allowed" : "pointer",
              fontSize: 18,
            }}
          >
            x
          </button>
        </header>

        <main style={{ padding: 22, display: "grid", gap: 14 }}>
          <div
            style={{
              border: "1px solid var(--border-default)",
              borderRadius: 12,
              padding: "10px 12px",
              background: "var(--accent-muted)",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--text-primary)" }}>{count}</strong> selected row{count === 1 ? "" : "s"}. TBD stores a null date so real tasks stay visible without fake placeholder dates.
          </div>

          <DateField
            label="start date"
            enabled={updateStart}
            mode={startMode}
            value={startDate}
            onEnabledChange={setUpdateStart}
            onModeChange={setStartMode}
            onValueChange={setStartDate}
          />
          <DateField
            label="end date"
            enabled={updateEnd}
            mode={endMode}
            value={endDate}
            onEnabledChange={setUpdateEnd}
            onModeChange={setEndMode}
            onValueChange={setEndDate}
          />

          {validation ? (
            <div style={{ color: "var(--text-muted)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
              {validation}
            </div>
          ) : null}
        </main>

        <footer
          style={{
            padding: "14px 22px 18px",
            borderTop: "1px solid var(--divider)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            background: "var(--sbd-gantt-panel-strong)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid var(--border-default)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 800,
              cursor: isSaving ? "not-allowed" : "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!!validation || isSaving}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--accent)",
              background: validation ? "var(--bg-surface)" : "var(--accent)",
              color: validation ? "var(--text-muted)" : "var(--on-accent)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.08em",
              cursor: validation || isSaving ? "not-allowed" : "pointer",
              opacity: validation || isSaving ? 0.65 : 1,
            }}
          >
            {isSaving ? "APPLYING..." : "APPLY DATES"}
          </button>
        </footer>
      </div>
    </>
  );
}
