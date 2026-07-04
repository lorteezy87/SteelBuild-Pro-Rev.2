import React from "react";
import { computePortfolioHealthGauge } from "../portfolioDerive";

/**
 * SidebarHealthGauge — the SVG donut gauge at the top of the Contextual
 * Insights sidebar showing average portfolio health (0–100) with a color band.
 * Extracted verbatim from PortfolioView; geometry comes from
 * computePortfolioHealthGauge(enrichedMetrics).
 */
export default function SidebarHealthGauge({ enrichedMetrics }) {
  const { avgScore, circumference, offset, color, label } = computePortfolioHealthGauge(enrichedMetrics);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "10px 0" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", color: "var(--text-muted)", textTransform: "uppercase" }}>
        Portfolio Health
      </div>
      <svg width={96} height={96} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={48} cy={48} r={38} fill="none" stroke="var(--border-default)" strokeWidth={5} />
        <circle cx={48} cy={48} r={38} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease-out", filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
        <text x={48} y={48} textAnchor="middle" dy="0.35em"
          style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 800, fill: color, transform: "rotate(90deg)", transformOrigin: "48px 48px" }}
        >
          {avgScore}
        </text>
      </svg>
      <span style={{
        fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
        color, letterSpacing: "0.10em",
        background: `${color}18`, border: `1px solid ${color}44`,
        borderRadius: 4, padding: "3px 10px",
      }}>
        {label}
      </span>
    </div>
  );
}
