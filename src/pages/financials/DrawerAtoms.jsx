import React from "react";
import { mono, body } from "./utils";

export function DrawerTile({ label, value, sub, accent = "var(--accent)" }) {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      padding: "10px 12px",
      borderTop: `2px solid ${accent}`,
    }}>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: accent, lineHeight: 1.2, marginBottom: 2 }}>
        {value}
      </div>
      {sub && <div style={{ ...mono, fontSize: 10, color: "var(--text-secondary)" }}>{sub}</div>}
    </div>
  );
}

export function ChartLegend({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 9, color: "var(--text-secondary)" }}>{label}</span>
    </div>
  );
}

export const drawerTd = {
  ...body,
  fontSize: 11,
  color: "var(--text-primary)",
  padding: "7px 6px",
  borderBottom: "1px solid var(--divider)",
  whiteSpace: "nowrap",
};

export const drawerTdRight = { ...drawerTd, textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 };
