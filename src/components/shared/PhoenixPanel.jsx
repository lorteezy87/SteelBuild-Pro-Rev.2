import React from "react";

// Phoenix standard panel with orange left-border header
export function PhoenixPanel({ title, count, actions, children, style = {} }) {
  return (
    <div className="sbd-card" style={{
      background: "var(--bg-surface)",
      border: "none",
      borderRadius: "var(--radius-card)",
      overflow: "hidden",
      padding: 0,
      ...style
    }}>
      {(title || actions) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 18px",
          borderBottom: "1px solid var(--divider)",
          background: "var(--bg-surface-low)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {title && (
              <span style={{
                fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 700,
                color: "var(--text-primary)", letterSpacing: "0.12em", textTransform: "uppercase"
              }}>{title}</span>
            )}
            {count != null && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                color: "var(--accent)", borderRadius: 4, padding: "1px 6px", letterSpacing: "0.06em"
              }}>{count}</span>
            )}
          </div>
          {actions && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// Phoenix data-pair: label above value
export function DataPair({ label, value, mono = false }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: mono ? "var(--font-mono)" : "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{value || "—"}</div>
    </div>
  );
}

// Phoenix table header style
export const phoenixTH = {
  fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em",
  textTransform: "uppercase", color: "var(--text-muted)",
  fontWeight: 700, padding: "8px 12px", background: "var(--hover-bg)",
  borderBottom: "1px solid var(--divider)"
};

// Phoenix table row style
export const phoenixTR = (overdue = false, over = false) => ({
  borderBottom: "1px solid var(--divider)",
  background: overdue ? "var(--danger-muted)" : over ? "var(--warning-muted)" : "transparent",
  cursor: "pointer",
  borderLeft: overdue ? "3px solid var(--status-error)" : "3px solid transparent",
});

export const phoenixTD = {
  fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)",
  padding: "8px 12px", verticalAlign: "middle"
};

export const phoenixTDMono = {
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)",
  padding: "8px 12px", verticalAlign: "middle"
};