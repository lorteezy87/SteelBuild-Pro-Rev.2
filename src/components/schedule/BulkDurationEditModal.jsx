import React, { useEffect, useMemo, useState } from "react";

const monoLabel = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const FIELD_STYLE = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontSize: 14,
  padding: "8px 10px",
  outline: "none",
  textAlign: "center",
};

export default function BulkDurationEditModal({ open, count = 0, isSaving = false, onClose, onSubmit }) {
  const [mode, setMode] = useState("set");
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode("set");
    setValue("");
  }, [open]);

  const parsed = parseInt(value, 10);
  const isValid = Number.isFinite(parsed) && (mode === "set" ? parsed >= 0 : parsed !== 0);

  const validation = useMemo(() => {
    if (value === "") return "Enter a duration value.";
    if (!Number.isFinite(parsed)) return "Must be a whole number.";
    if (mode === "set" && parsed < 0) return "Duration cannot be negative.";
    if (mode !== "set" && parsed === 0) return "Offset must be non-zero.";
    return "";
  }, [value, parsed, mode]);

  const handleSubmit = () => {
    if (validation || isSaving) return;
    onSubmit({ mode, days: parsed });
  };

  if (!open) return null;

  const modes = [
    { key: "set", label: "SET TO", desc: "Replace duration with this value" },
    { key: "add", label: "ADD", desc: "Add days to current duration" },
    { key: "subtract", label: "SUBTRACT", desc: "Subtract days from current duration" },
  ];

  return (
    <>
      <div
        onClick={isSaving ? undefined : onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.70)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          zIndex: 998,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk edit task durations"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(480px, 94vw)",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 96%, #000 4%) 0%, var(--bg-surface-low) 100%)",
          border: "1px solid var(--accent-border)",
          borderRadius: 18,
          boxShadow: "0 28px 80px rgba(0,0,0,0.78), inset 0 1px 0 rgba(255,255,255,0.06)",
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
              Task Durations
            </h2>
            <p style={{ margin: "8px 0 0", color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.45 }}>
              End dates will be recalculated from each task's start date + new duration.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close bulk duration editor"
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
              background: "rgba(86,176,255,0.08)",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            <strong style={{ color: "var(--text-primary)" }}>{count}</strong> selected row{count === 1 ? "" : "s"}.
            Summary rows are automatically skipped.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {modes.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                style={{
                  borderRadius: 10,
                  border: mode === m.key ? "1px solid var(--accent)" : "1px solid var(--border-default)",
                  background: mode === m.key ? "rgba(86,176,255,0.14)" : "var(--bg-surface)",
                  color: mode === m.key ? "var(--accent)" : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  padding: "10px 10px",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div
            style={{
              border: "1px solid var(--border-default)",
              borderRadius: 14,
              background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--bg-surface)) 0%, var(--bg-surface) 100%)",
              padding: 14,
              display: "grid",
              gap: 10,
            }}
          >
            <label style={monoLabel}>
              {mode === "set" ? "New duration (days)" : mode === "add" ? "Days to add" : "Days to subtract"}
            </label>
            <input
              type="number"
              min={mode === "set" ? 0 : 1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              placeholder={mode === "set" ? "e.g. 14" : "e.g. 5"}
              autoFocus
              style={FIELD_STYLE}
            />
            <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {mode === "set" && "All selected tasks will have their duration set to this value."}
              {mode === "add" && "This many days will be added to each task's current duration."}
              {mode === "subtract" && "This many days will be subtracted (minimum 0)."}
            </div>
          </div>

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
            background: "rgba(0,0,0,0.20)",
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
              background: validation ? "var(--bg-surface)" : "linear-gradient(135deg, var(--accent) 0%, #2f8ee8 100%)",
              color: validation ? "var(--text-muted)" : "#06101d",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.08em",
              cursor: validation || isSaving ? "not-allowed" : "pointer",
              opacity: validation || isSaving ? 0.65 : 1,
            }}
          >
            {isSaving ? "APPLYING..." : "APPLY DURATIONS"}
          </button>
        </footer>
      </div>
    </>
  );
}
