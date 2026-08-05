import { Button } from "@/components/design-system";
/** Presentational close-out signature modal for Punchlist. */
export function CloseoutSignatureModal({ count, signature, onSignatureChange, onCancel, onConfirm, isSaving }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !isSaving) onCancel(); }}
    >
      <div style={{
        background: "var(--bg-surface-secondary)",
        border: "1px solid var(--border-default)",
        borderRadius: 16,
        padding: 24,
        maxWidth: 480,
        width: "92%",
      }}>
        <h3 style={{
          fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
          margin: "0 0 14px", color: "var(--text-primary)",
          textTransform: "uppercase", letterSpacing: "0.10em",
        }}>
          Close {count} Item{count === 1 ? "" : "s"}
        </h3>
        <p style={{
          fontFamily: "var(--font-body)", fontSize: 12,
          color: "var(--text-secondary)", margin: "0 0 14px", lineHeight: 1.5,
        }}>
          This will mark all {count} selected item{count === 1 ? "" : "s"} as Completed (100%) and stamp
          your typed name as the close-out signature. Type your name to confirm.
        </p>
        <input
          type="text"
          autoFocus
          value={signature}
          onChange={(e) => onSignatureChange(e.target.value)}
          placeholder="Your name (text signature)"
          style={{
            width: "100%",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "10px 12px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 16,
          }}
          disabled={isSaving}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={isSaving || !signature.trim()}>
            {isSaving ? "Closing…" : "Sign & Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}
