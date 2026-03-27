import React from "react";

const accentMap = {
  blue:   { color: "var(--status-info)" },
  green:  { color: "var(--status-success)" },
  amber:  { color: "var(--status-warning)" },
  rose:   { color: "var(--status-error)" },
  purple: { color: "var(--chart-4)" },
  slate:  { color: "var(--accent)" },
};

export default function KPIStrip({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
      {items.map((item, i) => {
        const accent = accentMap[item.color || "slate"];
        return (
          <div key={i} style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderTop: `2px solid ${accent.color}`,
            borderRadius: 12,
            padding: "12px 14px",
            boxShadow: `0 -1px 0 ${accent.color}44, var(--shadow-sm)`,
            position: "relative",
            overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${accent.color}33, transparent)` }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.16em", color: "var(--text-muted)", textTransform: "uppercase", margin: "0 0 5px" }}>{item.label}</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: accent.color, margin: 0, lineHeight: 1 }}>{item.value}</p>
            {item.sub && <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", margin: "3px 0 0", letterSpacing: "0.06em" }}>{item.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}