/**
 * Modal — plain fixed-overlay modal with backdrop blur.
 *
 * Architectural rule: NO Radix Dialog. NO portals. This is a custom
 * `position: fixed; inset: 0` overlay with a blurred, darkened
 * backdrop, an Escape-to-close handler, and body-overflow lock while
 * open.
 *
 * Click on the backdrop closes; click on content stops propagation.
 * Header / body / footer each use `flex-shrink: 0` for the chrome
 * and `flex: 1; overflow-y: auto` for the scrollable body per the
 * project-wide modal convention.
 */

import React, { useEffect } from "react";
import Icon from "./Icon";

export default function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = 720,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(6,8,16,0.72)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "60px 20px 20px",
        animation: "sbp-modal-fade 0.14s ease-out",
      }}
    >
      <style>{`
        @keyframes sbp-modal-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sbp-modal-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          maxHeight: "calc(100vh - 80px)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderTop: "2px solid var(--accent)",
          borderRadius: "var(--radius-card)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.65), 0 0 40px var(--accent-muted)",
          display: "flex",
          flexDirection: "column",
          animation: "sbp-modal-rise 0.18s ease-out",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {eyebrow && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.14em",
                  marginBottom: 4,
                }}
              >
                {eyebrow}
              </div>
            )}
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-primary)",
                lineHeight: 1.2,
              }}
            >
              {title}
            </div>
          </div>
          <div
            onClick={onClose}
            title="Close"
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-muted)",
              flexShrink: 0,
            }}
          >
            <Icon name="x" size={12} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--border-default)",
              background: "var(--bg-surface-low)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              justifyContent: "flex-end",
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
