import React, { useState, useEffect } from "react";

const STORAGE_PREFIX = "sbp-card-";

/**
 * Wraps content in a collapsible card with localStorage persistence.
 * @param {string} id         Unique ID for localStorage key
 * @param {string} title      Card header title
 * @param {string} tone       Color tone: "accent" | "danger" | "warning" | "success" | "muted"
 * @param {number|string} count  Optional badge count
 * @param {React.ReactNode} action  Optional right-side header element
 * @param {React.ReactNode} children  Card body content
 * @param {boolean} defaultCollapsed  Initial collapsed state if no saved preference
 */

const TONE_MAP = {
  danger:  { color: "var(--status-error)",   bg: "var(--danger-muted)",  border: "var(--danger-border)" },
  warning: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)" },
  success: { color: "var(--status-success)", bg: "var(--success-muted)", border: "var(--success-border)" },
  accent:  { color: "var(--accent)",         bg: "var(--accent-muted)",  border: "var(--accent-border)" },
  muted:   { color: "var(--text-muted)",     bg: "rgba(140,144,159,0.10)", border: "rgba(140,144,159,0.24)" },
};

export default function CollapsibleCard({
  id,
  title,
  tone = "accent",
  count,
  action,
  children,
  defaultCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (!id) return defaultCollapsed;
    try {
      const saved = localStorage.getItem(STORAGE_PREFIX + id);
      return saved != null ? saved === "1" : defaultCollapsed;
    } catch { return defaultCollapsed; }
  });

  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem(STORAGE_PREFIX + id, collapsed ? "1" : "0");
    } catch { /* noop */ }
  }, [id, collapsed]);

  const style = TONE_MAP[tone] || TONE_MAP.accent;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        transition: "box-shadow 0.2s",
      }}
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          width: "100%",
          padding: "12px 14px",
          borderBottom: collapsed ? "none" : "1px solid var(--divider)",
          background: "var(--bg-sidebar)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {/* Collapse indicator */}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              color: "var(--text-muted)",
              transition: "transform 0.2s",
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          >
            &#9660;
          </span>
          <div style={{ width: 3, height: 16, background: style.color, borderRadius: 2, flexShrink: 0 }} />
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            {title}
          </span>
          {count != null && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                color: style.color,
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: "var(--radius-badge)",
                padding: "2px 8px",
              }}
            >
              {count}
            </span>
          )}
        </div>
        {/* Right side: custom action + collapse indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          {action}
        </div>
      </button>

      {/* Body — animated collapse */}
      {!collapsed && (
        <div
          style={{ padding: 12 }}
          className="anim-fade-in"
        >
          {children}
        </div>
      )}
    </div>
  );
}
