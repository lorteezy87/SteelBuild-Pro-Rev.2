import React from "react";

export default function KPICard({ label, value, icon, color, urgent }) {
  return (
    <div style={{
      background: urgent ? "var(--danger-muted)" : "var(--bg-surface)",
      border: `1px solid ${urgent ? "var(--danger-border)" : "var(--border-default)"}`,
      borderTop: `3px solid ${color}`,
      borderRadius: "12px",
      padding: "16px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      transition: "all 0.15s",
      cursor: "pointer",
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = urgent ? "var(--danger-border)" : "var(--accent-border)";
      e.currentTarget.style.background = "var(--hover-bg)";
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = urgent ? "var(--danger-border)" : "var(--border-default)";
      e.currentTarget.style.background = urgent ? "var(--danger-muted)" : "var(--bg-surface)";
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <span style={{ fontSize: "16px", opacity: 0.7 }}>{icon}</span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "9px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          flex: 1,
        }}>
          {label}
        </span>
        {urgent && <span style={{ fontSize: "10px", color: "var(--status-error)" }}>⚠</span>}
      </div>
      <div style={{
        fontSize: "28px",
        fontWeight: 700,
        color: color,
        lineHeight: 1,
        fontFamily: "var(--font-mono)",
      }}>
        {value}
      </div>
    </div>
  );
}