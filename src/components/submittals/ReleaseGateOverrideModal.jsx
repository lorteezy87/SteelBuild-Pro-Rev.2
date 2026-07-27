/**
 * ReleaseGateOverrideModal — shown when a "Release for Fabrication" submittal
 * move is blocked server-side by open RFIs referencing the package's sheets.
 * Collects a REQUIRED PM override reason; on confirm the caller retries the
 * release with the reason, which the server records on
 * submittals.fab_release_override_reason (and which lets the gate trigger pass).
 */
import { useEffect, useState } from "react";

const mono = { fontFamily: "var(--font-mono, ui-monospace, monospace)" };

const btnBase = {
  ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
  padding: "8px 16px", borderRadius: 2, border: "1px solid var(--border-default)",
  cursor: "pointer", textTransform: "uppercase",
};

export default function ReleaseGateOverrideModal({
  open,
  blockingRfiNumbers = [],
  onClose,
  onConfirm,
  busy = false,
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;
  const ready = reason.trim().length > 0;
  const count = blockingRfiNumbers.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, background: "color-mix(in srgb, var(--bg-base) 70%, transparent)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        className="sbd-card-strong"
        style={{
          background: "var(--bg-surface-secondary)", border: "1px solid var(--status-error)",
          borderRadius: "var(--radius-card, 4px)", width: 480, maxWidth: "92vw", padding: 24,
          boxShadow: "0 20px 60px color-mix(in srgb, var(--bg-base) 40%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.2em", color: "var(--status-error)", marginBottom: 6 }}>
          FAB RELEASE BLOCKED
        </div>
        <h3 style={{ margin: 0, marginBottom: 10, fontSize: 16, color: "var(--text-primary)" }}>
          Release despite {count} open RFI{count === 1 ? "" : "s"}?
        </h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, marginBottom: 12, lineHeight: 1.5 }}>
          Open RFIs reference sheets in this submittal&apos;s package. Releasing now risks
          fabricating to a detail that may change. The PM override is recorded with your reason.
        </p>
        {count > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {blockingRfiNumbers.slice(0, 8).map((n) => (
              <span key={n} style={{ ...mono, fontSize: 10, fontWeight: 700, color: "var(--status-error)", border: "1px solid var(--status-error)", borderRadius: 999, padding: "2px 8px" }}>
                {n}
              </span>
            ))}
            {count > 8 && <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>+{count - 8} more</span>}
          </div>
        )}
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Override reason (required) — why release despite the open RFIs?"
          style={{
            ...mono, width: "100%", boxSizing: "border-box", fontSize: 11, padding: "8px 10px",
            borderRadius: 2, background: "var(--bg-input, var(--bg-surface-low))",
            border: `1px solid ${ready ? "var(--border-default)" : "var(--status-error)"}`,
            color: "var(--text-primary)", outline: "none", resize: "vertical", marginBottom: 14,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} disabled={busy} style={{ ...btnBase, background: "var(--bg-page)", color: "var(--text-muted)" }}>
            Cancel
          </button>
          <button
            onClick={() => ready && onConfirm(reason.trim())}
            disabled={busy || !ready}
            title={ready ? undefined : "Enter a reason to override"}
            style={{
              ...btnBase,
              background: ready ? "var(--danger-muted)" : "var(--bg-page)",
              borderColor: ready ? "var(--status-error)" : "var(--border-default)",
              color: ready ? "var(--status-error)" : "var(--text-muted)",
              opacity: busy ? 0.6 : 1,
              cursor: ready && !busy ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Releasing…" : "Release anyway"}
          </button>
        </div>
      </div>
    </div>
  );
}
