/**
 * Sparkline — tiny SVG area+line chart, no dependencies.
 * Used inline in KPI tiles, expense burndown, weekly activity cards.
 */

import React from "react";

export default function Sparkline({ data, color = "var(--accent)", height = 28, width = 80, fill = true }) {
  if (!data || !data.length) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1 || 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 2) - 1]);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaD = `${d} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} role="img" aria-label="Sparkline trend chart" style={{ display: "block" }}>
      {fill && <path d={areaD} fill={color} opacity="0.15" />}
      <path
        d={d}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
