import React, { useEffect, useId } from "react";
import { X } from "lucide-react";

const modalSurface = "linear-gradient(180deg, rgb(11,16,24) 0%, rgb(7,10,16) 100%)";
const modalPanel = "rgb(18,25,36)";
const modalPanelMuted = "rgb(19,26,38)";
const modalBorder = "rgba(135,154,180,0.22)";
const modalBorderMuted = "rgba(135,154,180,0.14)";
const modalText = "rgba(238,244,252,0.96)";
const modalTextSecondary = "rgba(214,224,238,0.88)";
const modalTextMuted = "rgba(177,191,211,0.78)";

export const btnPrimary = {
  background: "linear-gradient(135deg, rgba(86,176,255,0.98) 0%, rgba(35,134,230,0.98) 100%)",
  border: "1px solid rgba(86,176,255,0.4)",
  borderRadius: 8,
  padding: "8px 20px",
  color: "#04111f",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  letterSpacing: "0.02em",
  boxShadow: "0 10px 24px rgba(17,113,190,0.28)",
  transition: "box-shadow 0.15s",
};

export const btnSecondary = {
  background: modalPanelMuted,
  border: `1px solid ${modalBorder}`,
  borderRadius: 8,
  padding: "7px 18px",
  color: modalTextSecondary,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.15s",
};

export const btnDanger = {
  background: "rgba(239,68,68,0.13)",
  border: "1px solid rgba(239,68,68,0.35)",
  borderRadius: 8,
  padding: "7px 18px",
  color: "var(--status-error)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

export const inputStyle = {
  width: "100%",
  background: modalPanel,
  border: `1px solid ${modalBorder}`,
  borderRadius: 8,
  padding: "8px 12px",
  color: modalText,
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: "18px",
  minHeight: 38,
  outline: "none",
  boxSizing: "border-box",
  colorScheme: "dark",
  boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
};

export const inputDisabledStyle = {
  ...inputStyle,
  background: modalPanelMuted,
  color: modalTextMuted,
  cursor: "not-allowed",
};

export const labelStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  letterSpacing: "0.12em",
  color: modalTextMuted,
  marginBottom: 6,
  textTransform: "uppercase",
  fontWeight: 500,
};

export default function PhoenixModal({ open, onClose, title, children, footer, maxWidth = 680 }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(1,4,10,0.76)",
        backdropFilter: "blur(8px)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          background: modalSurface,
          border: `1px solid ${modalBorder}`,
          borderRadius: 16,
          boxShadow: "0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
          maxWidth,
          width: "90vw",
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          color: modalText,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 16px",
            borderBottom: `1px solid ${modalBorderMuted}`,
            background: "rgb(12,17,25)",
            flexShrink: 0,
          }}
        >
          <span
            id={titleId}
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 700,
              color: modalText,
              letterSpacing: "0.04em",
            }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: modalPanelMuted,
              border: `1px solid ${modalBorderMuted}`,
              color: modalTextMuted,
              cursor: "pointer",
              padding: 4,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "20px 24px", flex: 1, overflowY: "auto", color: modalText }}>
          {children}
        </div>

        {footer && (
          <div
            style={{
              padding: "14px 24px",
              borderTop: `1px solid ${modalBorderMuted}`,
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              background: "rgb(10,15,23)",
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function FormField({ label, error = undefined, children, span2 = false }) {
  return (
    <div style={span2 ? { gridColumn: "span 2" } : {}}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && (
        <p style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--status-error)", marginTop: 4 }}>
          {error}
        </p>
      )}
    </div>
  );
}
