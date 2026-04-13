import React, { useEffect, useId } from "react";
import { X } from "lucide-react";

// ── Shared button style constants ────────────────────────────────────
export const btnPrimary = {
  background: "var(--accent)",
  border: "none",
  borderRadius: 8,
  padding: "8px 20px",
  color: "white",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.02em",
  boxShadow: "0 4px 14px var(--accent)44",
  transition: "box-shadow 0.15s",
};

export const btnSecondary = {
  background: "var(--hover-bg)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "7px 18px",
  color: "var(--text-secondary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s",
};

export const btnDanger = {
  background: "var(--danger-muted)",
  border: "1px solid var(--danger-border)",
  borderRadius: 8,
  padding: "7px 18px",
  color: "var(--status-error)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

// ── Input style constant ─────────────────────────────────────────────
/** @type {import('react').CSSProperties} */
export const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

/** @type {import('react').CSSProperties} */
export const inputDisabledStyle = {
  ...inputStyle,
  background: "var(--hover-bg)",
  color: "var(--text-muted)",
  cursor: "not-allowed",
};

// ── Label style constant ─────────────────────────────────────────────
export const labelStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  color: "var(--text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  fontWeight: 500,
};

// ── Phoenix Modal wrapper ────────────────────────────────────────────
// Renders a properly styled overlay + panel without Shadcn Dialog. Adds
// `role="dialog"` + `aria-modal` for screen readers, an `aria-labelledby`
// link to the header, and Escape-to-close so it behaves like a real dialog.
export default function PhoenixModal({ open, onClose, title, children, footer, maxWidth = 680 }) {
  const titleId = useId();

  // Close on Escape — only while the modal is open. We attach to window so
  // it works regardless of where focus currently lives inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      aria-hidden="true"
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: "var(--bg-surface-secondary)",
          border: "1px solid var(--accent-border)",
          borderRadius: 16,
          boxShadow: "var(--shadow-lg)",
          maxWidth,
          width: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
         {/* Header */}
         <div style={{
           display: "flex", alignItems: "center", justifyContent: "space-between",
           padding: "20px 24px 16px",
           borderBottom: "1px solid var(--divider)",
           flexShrink: 0,
         }}>
           <span
             id={titleId}
             style={{
               fontFamily: "var(--font-display)",
               fontSize: 18, fontWeight: 700,
               color: "var(--text-primary)", letterSpacing: "0.04em",
             }}
           >{title}</span>
           <button
             onClick={onClose}
             aria-label="Close dialog"
             style={{
               background: "transparent", border: "none",
               color: "var(--text-muted)", cursor: "pointer",
               padding: 4, borderRadius: 6,
               display: "flex", alignItems: "center",
             }}
           >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto" }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: "14px 24px",
            borderTop: "1px solid var(--divider)",
            display: "flex", justifyContent: "flex-end", gap: 10,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Form field helpers ───────────────────────────────────────────────
export function FormField({ label, error = undefined, children, span2 = false }) {
  return (
    <div style={span2 ? { gridColumn: "span 2" } : {}}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && (
         <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--status-error)", marginTop: 4 }}>{error}</p>
       )}
    </div>
  );
}