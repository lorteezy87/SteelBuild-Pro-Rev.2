import React from "react";

// Phoenix standard panel with orange left-border header
export function PhoenixPanel({ title, count, actions, children, style = {} }) {
  return (
    <div className="sbd-card" style={{
      background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 90%, #000 10%) 0%, color-mix(in srgb, var(--bg-surface-low) 86%, #000 14%) 100%)",
      border: "1px solid color-mix(in srgb, var(--border-default) 88%, white 12%)",
      borderRadius: "16px",
      overflow: "hidden",
      padding: 0,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 28px rgba(0,0,0,0.28)",
      ...style
    }}>
      {(title || actions) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--divider)",
          background: "color-mix(in srgb, var(--bg-surface-low) 88%, #000 12%)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {title && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                color: "var(--text-primary)", letterSpacing: "0.14em", textTransform: "uppercase"
              }}>{title}</span>
            )}
            {count != null && (
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                background: "var(--accent-muted)", border: "1px solid var(--accent-border)",
                color: "var(--accent)", borderRadius: 999, padding: "2px 7px", letterSpacing: "0.08em"
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
  fontWeight: 700, padding: "10px 12px", background: "color-mix(in srgb, var(--bg-surface-low) 90%, #000 10%)",
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
