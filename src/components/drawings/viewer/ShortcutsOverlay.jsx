/**
 * Keyboard-shortcut overlay for the drawings viewer.
 *
 * Shown when the user presses `?`. Dims the viewer, centers a card
 * listing every bound key. Dismissed with Escape, click-outside, or the
 * X button.
 *
 * Open/close state is owned by the parent viewer — this is a pure render.
 */

import React, { useEffect } from "react";
import { X } from "lucide-react";

const mono = { fontFamily: "var(--font-mono)" };

const SHORTCUTS = [
  { group: "Navigation", items: [
    { keys: ["←", "→"], desc: "Previous / next sheet" },
    { keys: ["↑", "↓"], desc: "Previous / next sheet" },
    { keys: ["PgUp", "PgDn"], desc: "Previous / next PDF page" },
    { keys: ["j", "k"], desc: "Next / previous PDF page (vim)" },
    { keys: ["["], desc: "Toggle sheet list sidebar" },
    { keys: ["]"], desc: "Toggle sheet list sidebar" },
    { keys: ["f"], desc: "Toggle thumbnail filmstrip" },
    { keys: ["i"], desc: "Toggle sheet context panel" },
  ]},
  { group: "Zoom & Rotate", items: [
    { keys: ["+", "="],   desc: "Zoom in (25%)" },
    { keys: ["−"],        desc: "Zoom out (25%)" },
    { keys: ["0"],        desc: "Reset zoom to 100%" },
    { keys: ["r"],        desc: "Rotate 90° clockwise" },
    { keys: ["Shift+R"],  desc: "Rotate 90° counter-clockwise" },
  ]},
  { group: "Markup", items: [
    { keys: ["v"],        desc: "Select tool (default)" },
    { keys: ["p"],        desc: "Redline pen (freehand)" },
    { keys: ["b"],        desc: "Rectangle / box" },
    { keys: ["a"],        desc: "Arrow" },
    { keys: ["t"],        desc: "Text note pin" },
    { keys: ["Del"],      desc: "Delete selected markup" },
  ]},
  { group: "Other", items: [
    { keys: ["?"],   desc: "Show this shortcut panel" },
    { keys: ["Esc"], desc: "Close dialogs · back to select tool" },
  ]},
];

export default function ShortcutsOverlay({ open, onClose }) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 8,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--divider)",
            background: "var(--bg-surface-low)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontFamily: "Space Grotesk, var(--font-display)", fontSize: 14, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
              Keyboard Shortcuts
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 2 }}>
              Drawings Viewer
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "1px solid var(--border-default)",
              borderRadius: 4,
              padding: 4,
              cursor: "pointer",
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
          {SHORTCUTS.map((section) => (
            <div key={section.group}>
              <div
                style={{
                  ...mono,
                  fontSize: 9,
                  fontWeight: 700,
                  color: "var(--text-muted)",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 6,
                  borderLeft: "3px solid var(--accent)",
                  paddingLeft: 6,
                }}
              >
                {section.group}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {section.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "5px 8px",
                      borderRadius: 4,
                      background: i % 2 === 0 ? "var(--bg-surface-low)" : "transparent",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--text-primary)" }}>
                      {item.desc}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          style={{
                            ...mono,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "3px 7px",
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-default)",
                            borderBottomWidth: 2,
                            borderRadius: 3,
                            color: "var(--accent)",
                            letterSpacing: 0,
                            textTransform: "none",
                            minWidth: 24,
                            textAlign: "center",
                          }}
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--divider)",
            background: "var(--bg-surface-low)",
            ...mono,
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Press <kbd style={miniKbd}>?</kbd> anywhere to reopen</span>
          <span>Press <kbd style={miniKbd}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}

const miniKbd = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  padding: "1px 5px",
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 2,
  color: "var(--accent)",
  letterSpacing: 0,
  textTransform: "none",
};
