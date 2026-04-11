import React from "react";

export default function ProgressBar({ value = 0, max = 100, color = "blue", showLabel = true }) {
  const pct = Math.min(100, Math.max(0, max > 0 ? (value / max) * 100 : 0));
  let fill = "var(--accent)";
  if (color === "rose") { fill = "var(--status-error)"; }
  else if (color === "amber") { fill = "var(--status-warning)"; }
  else if (color === "green") { fill = "var(--status-success)"; }
  else if (color === "purple") { fill = "var(--chart-4)"; }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <div style={{ flex: 1, background: "var(--border-default)", borderRadius: 3, height: 5, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, background: fill, width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
      {showLabel && <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", width: 32, textAlign: "right", flexShrink: 0 }}>{pct.toFixed(0)}%</span>}
    </div>
  );
}