import React from "react";
import { mono } from "./drawingsConfig";

/**
 * Dismissible alert banner for revision-control warnings.
 * @param {{ alert: object, onDismiss?: () => void, onFilter?: (sheets: Array) => void }} props
 */
export default function AlertBanner({ alert, onDismiss: _onDismiss, onFilter }) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      padding: "10px 14px",
      borderRadius: 2,
      background: alert.bg,
      border: `1px solid ${alert.border}`,
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>
        {alert.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          ...mono,
          fontSize: 11,
          fontWeight: 700,
          color: alert.color,
          letterSpacing: "0.04em",
          marginBottom: 2,
        }}>
          {alert.title}
        </div>
        <div style={{
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "var(--text-secondary)",
          lineHeight: 1.4,
        }}>
          {alert.detail}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {onFilter && (
          <button
            onClick={() => onFilter(alert.sheets)}
            style={{
              ...mono,
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "4px 10px",
              borderRadius: 2,
              cursor: "pointer",
              background: "none",
              border: `1px solid ${alert.border}`,
              color: alert.color,
              whiteSpace: "nowrap",
            }}
          >
            SHOW
          </button>
        )}
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 14,
            lineHeight: 1,
            padding: "2px 4px",
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
