import React from "react";

const accentMap = {
  blue:   { color: "var(--status-info)",    bg: "rgba(96,165,250,0.07)" },
  green:  { color: "var(--status-success)", bg: "rgba(34,197,94,0.07)" },
  amber:  { color: "var(--status-warning)", bg: "rgba(245,158,11,0.07)" },
  rose:   { color: "var(--status-error)",   bg: "rgba(239,68,68,0.07)" },
  purple: { color: "var(--chart-4)",        bg: "rgba(168,85,247,0.07)" },
  slate:  { color: "var(--accent)",         bg: "rgba(232,101,10,0.06)" },
};

export default function KPIStrip({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
      {items.map((item, i) => {
        const accent = accentMap[item.color || "slate"];
        return (
          <div key={i} style={{
            background: accent.bg || "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderTop: `3px solid ${accent.color}`,
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