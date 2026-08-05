import React, { useEffect, useId } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputStyle,
  inputDisabledStyle,
  labelStyle,
  PHOENIX_OVERLAY_STYLE,
  phoenixDialogStyle,
  PHOENIX_HEADER_STYLE,
  PHOENIX_TITLE_STYLE,
  PHOENIX_CLOSE_BTN_STYLE,
  PHOENIX_BODY_STYLE,
  PHOENIX_FOOTER_STYLE,
} from "./phoenixModalHelpers";

// Back-compat re-exports for form modals that import chrome from this module.
export {
  btnPrimary,
  btnSecondary,
  btnDanger,
  inputStyle,
  inputDisabledStyle,
  labelStyle,
};

export default function PhoenixModal({ open, onClose, title, children, footer, maxWidth = 680 }) {
  const titleId = useId();
  const trapRef = useFocusTrap(open);

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
      style={PHOENIX_OVERLAY_STYLE}
    >
      <div
        ref={trapRef}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={phoenixDialogStyle(maxWidth)}
      >
        <div style={PHOENIX_HEADER_STYLE}>
          <span id={titleId} style={PHOENIX_TITLE_STYLE}>
            {title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            style={PHOENIX_CLOSE_BTN_STYLE}
          >
            <X size={16} />
          </button>
        </div>

        <div style={PHOENIX_BODY_STYLE}>
          {children}
        </div>

        {footer && (
          <div style={PHOENIX_FOOTER_STYLE}>
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
