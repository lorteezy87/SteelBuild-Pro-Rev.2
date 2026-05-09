import React from "react";

const accentMap = {
  blue:   { color: "var(--status-info)",    bg: "rgba(96,165,250,0.07)" },
  green:  { color: "var(--status-success)", bg: "rgba(34,197,94,0.07)" },
  amber:  { color: "var(--status-warning)", bg: "rgba(245,158,11,0.07)" },
  rose:   { color: "var(--status-error)",   bg: "rgba(239,68,68,0.07)" },
  // "purple" is a legacy prop name — callers (CostDashboard, ExecutiveView,
  // etc.) still pass color="purple" for contingency / reserve tiles. The
  // actual color is now industrial amber; true purple read as out-of-place
  // in a steel fab UI. Alias "amber" for new call-sites.
  purple: { color: "var(--status-warning)", bg: "rgba(245,158,11,0.07)" },
  slate:  { color: "var(--accent)",         bg: "rgba(200,155,32,0.06)" },
};

export default function KPIStrip({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 }}>
      {items.map((item, i) => {
        const accent = accentMap[item.color || "slate"];
        return (
          <div key={i} style={{
            background: `linear-gradient(180deg, color-mix(in srgb, ${accent.color} 7%, var(--bg-surface-high)) 0%, var(--bg-surface) 52%, color-mix(in srgb, var(--bg-surface) 84%, #000 16%) 100%)`,
            border: "1px solid color-mix(in srgb, var(--border-default) 80%, rgba(255,255,255,0.06) 20%)",
            borderTop: `2px solid ${accent.color}`,
            borderRadius: 18,
            padding: "16px 16px 14px",
            boxShadow: `0 18px 40px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 1px color-mix(in srgb, ${accent.color} 10%, transparent)`,
            position: "relative",
            overflow: "hidden",
            minHeight: 92,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}>
            <div style={{ position: "absolute", inset: 0, background: `radial-gradient(circle at top right, color-mix(in srgb, ${accent.color} 18%, transparent) 0%, transparent 40%)`, pointerEvents: "none" }} />
            <div style={{ position: "absolute", top: 0, left: 18, right: 18, height: 1, background: `linear-gradient(90deg, transparent, ${accent.color}55, transparent)` }} />
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.18em", color: "var(--text-muted)", textTransform: "uppercase", margin: "0 0 9px", position: "relative" }}>{item.label}</p>
            <p style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: accent.color, margin: 0, lineHeight: 1, position: "relative", letterSpacing: "-0.02em" }}>{item.value}</p>
            {item.sub && <p style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", margin: "7px 0 0", letterSpacing: "0.08em", position: "relative" }}>{item.sub}</p>}
          </div>
        );
      })}
    </div>
  );
}
