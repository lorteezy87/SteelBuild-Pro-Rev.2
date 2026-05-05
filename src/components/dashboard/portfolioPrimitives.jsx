import React from "react";
import { formatCurrency } from "../shared/formatters";

/* ── Enhanced Mini SVG Sparkline with area fill and trend arrow ────────────── */
export function MiniSparkline({ data = [], color = "var(--accent)", width = 56, height = 22, showTrend = true }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const id = `spark-${Math.random().toString(36).slice(2, 8)}`;
  const coords = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * (height - 4) - 2,
  }));
  const linePoints = coords.map(c => `${c.x},${c.y}`).join(" ");
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
  const trend = data[data.length - 1] - data[0];
  const trendChar = trend > 0 ? "▲" : trend < 0 ? "▼" : "—";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill={`url(#${id})`} />
        <polyline points={linePoints} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={coords[coords.length-1].x} cy={coords[coords.length-1].y} r={2} fill={color} />
      </svg>
      {showTrend && trend !== 0 && (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, fontWeight: 700, lineHeight: 1 }}>
          {trendChar}
        </span>
      )}
    </div>
  );
}

export const PhoenixTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--bg-surface-high)",
        border: "1px solid var(--accent-border)",
        borderRadius: 2,
        padding: "8px 12px",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-primary)",
      }}
    >
      <div style={{ marginBottom: 4, color: "var(--accent)" }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value).replace(/\.\d+/, "")}
        </div>
      ))}
    </div>
  );
};

export const Card = ({ children, style = {} }) => (
  <div
    className="sbd-card"
    style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-card)",
      boxShadow: "var(--shadow-card)",
      overflow: "hidden",
      padding: 0,
      ...style,
    }}
  >
    {children}
  </div>
);

export const HeaderBar = ({ title, right, count }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 16px",
      borderBottom: "1px solid var(--divider)",
      background: "var(--bg-surface-low)",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 3, height: 16, background: "var(--accent)", borderRadius: 2 }} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.10em",
          color: "var(--text-primary)",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
      {count != null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            padding: "1px 6px",
            borderRadius: 2,
            background: "var(--accent-muted)",
            color: "var(--accent)",
            border: "1px solid var(--accent-border)",
          }}
        >
          {count}
        </span>
      )}
    </div>
    {right}
  </div>
);

// KPIBlock — shared tile layout for the portfolio KPI strip. Fixes a
// cut-off bug where long currency values ("$125,432,187") wrapped or
// clipped because the number span had no whitespace rule and the
// tile had a too-small min-width. We now clamp the tile to a minimum
// that fits an 11-digit dollar amount at the reduced 20px size +
// pin the value row to a single line with graceful overflow.
export const KPIBlock = ({ label, value, color, bordered, onClick, active }) => (
  <div
    onClick={onClick}
    className={onClick ? "sbd-card-hover" : undefined}
    style={{
      padding: "12px 20px",
      borderRight: bordered ? "1px solid var(--divider)" : "none",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      cursor: onClick ? "pointer" : "default",
      borderTop: active ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: active ? "0 0 12px rgba(59,130,246,0.25)" : "none",
      transition: "box-shadow 0.2s, border-top 0.2s",
      minWidth: 160,
      overflow: "hidden",
    }}
  >
    <span
      className="sbd-kpi-label"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        margin: 0,
      }}
    >
      {label}
    </span>
    <span
      title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
      className="sbd-kpi-value sbd-num"
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 20,
        fontWeight: 800,
        lineHeight: 1.1,
        color: color || "var(--text-primary)",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {value}
    </span>
  </div>
);
