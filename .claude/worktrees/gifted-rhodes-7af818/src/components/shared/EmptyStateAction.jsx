/**
 * EmptyStateAction — A compact, intelligent empty-state widget for panels
 * that have zero items. Shows a contextual one-liner message and one or two
 * action buttons instead of dead space.
 *
 * Usage:
 *   <EmptyStateAction
 *     message="No deliveries scheduled today"
 *     actions={[
 *       { label: "Schedule Delivery", onClick: () => navigate(...) },
 *       { label: "View Next 7 Days", onClick: () => setTab("next10"), secondary: true },
 *     ]}
 *   />
 */

import React from "react";

export default function EmptyStateAction({ message, actions = [], icon = null }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      padding: "28px 20px",
      textAlign: "center",
    }}>
      {icon && (
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 20,
          color: "var(--text-muted)",
          opacity: 0.4,
          lineHeight: 1,
        }}>
          {icon}
        </div>
      )}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        color: "var(--text-muted)",
        letterSpacing: "0.06em",
        lineHeight: 1.4,
        maxWidth: 320,
      }}>
        {message}
      </div>
      {actions.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 4 }}>
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={action.onClick}
              style={{
                padding: "6px 14px",
                borderRadius: "var(--radius-btn, 6px)",
                border: action.secondary
                  ? "1px solid var(--border-default)"
                  : "1px solid var(--accent-border)",
                background: action.secondary
                  ? "var(--hover-bg)"
                  : "var(--accent-muted)",
                color: action.secondary
                  ? "var(--text-secondary)"
                  : "var(--accent)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "background 0.15s, border-color 0.15s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = action.secondary
                  ? "var(--bg-surface-high)"
                  : "rgba(200,155,32,0.18)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = action.secondary
                  ? "var(--hover-bg)"
                  : "var(--accent-muted)";
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
