/**
 * Inline SVG charts for the Portfolio Reports dashboard.
 *
 * Kept dependency-free on purpose — the rest of the app has no chart
 * library and these two visuals are simple enough to draw by hand:
 *
 *   - `BarChartSVG`   — grouped budget-vs-actual bars with a grid.
 *   - `DonutChartSVG` — RFI-status distribution donut with legend.
 *
 * Both render `null` when there's no data so the caller can decide
 * what to show in the empty-state slot.
 */

import React from "react";
import { mono } from "./constants";
import { formatCurrency } from "./utils";

export function BarChartSVG({ data, width = 400, height = 200 }) {
  if (!data || data.length === 0) return null;
  const padding = { top: 20, right: 16, bottom: 40, left: 56 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.flatMap((d) => [d.budget || 0, d.actual || 0]), 1);
  const barGroupW = chartW / data.length;
  const barW = Math.max(6, Math.min(24, barGroupW * 0.32));
  const gap = 3;

  const gridLines = 5;
  const gridStep = maxVal / gridLines;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {/* Grid lines */}
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const y = padding.top + chartH - (chartH * (gridStep * i)) / maxVal;
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--divider)" strokeDasharray="3 3" />
            <text x={padding.left - 8} y={y + 3} textAnchor="end" style={{ ...mono, fontSize: 8, fill: "var(--text-muted)" }}>
              {formatCurrency(gridStep * i)}
            </text>
          </g>
        );
      })}
      {/* Bars */}
      {data.map((d, i) => {
        const cx = padding.left + barGroupW * i + barGroupW / 2;
        const bH = (d.budget / maxVal) * chartH;
        const aH = (d.actual / maxVal) * chartH;
        return (
          <g key={i}>
            <rect x={cx - barW - gap / 2} y={padding.top + chartH - bH} width={barW} height={bH} rx={2} fill="var(--bg-surface-highest)" />
            <rect x={cx + gap / 2}        y={padding.top + chartH - aH} width={barW} height={aH} rx={2} fill="var(--accent)" />
            <text x={cx} y={height - padding.bottom + 14} textAnchor="middle" style={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}>
              {d.name?.length > 10 ? d.name.slice(0, 10) + ".." : d.name}
            </text>
          </g>
        );
      })}
      {/* Legend */}
      <rect x={width - 120} y={4} width={8} height={8} rx={2} fill="var(--bg-surface-highest)" />
      <text x={width - 108} y={11} style={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}>Budget</text>
      <rect x={width - 60}  y={4} width={8} height={8} rx={2} fill="var(--accent)" />
      <text x={width - 48}  y={11} style={{ ...mono, fontSize: 9, fill: "var(--text-muted)" }}>Actual</text>
    </svg>
  );
}

/**
 * LineChartSVG — simple x/y line chart for revenue + revenue forecast.
 *
 * `data` shape: [{ label, value, forecast?: boolean }]. Points where
 * `forecast === true` are drawn with a dashed segment so callers can
 * mix historical (solid) and forecast (dashed) without two charts.
 */
export function LineChartSVG({ data, width = 560, height = 220, valueFormatter }) {
  if (!data || data.length === 0) return null;
  const padding = { top: 16, right: 16, bottom: 32, left: 56 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map((d) => Number(d.value) || 0), 1);
  const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;
  const fmt = valueFormatter || formatCurrency;

  const points = data.map((d, i) => ({
    x: padding.left + i * stepX,
    y: padding.top + chartH - ((Number(d.value) || 0) / maxVal) * chartH,
    forecast: !!d.forecast,
    label: d.label,
    value: d.value,
  }));

  // Build path segments: solid for historical contiguous run, dashed
  // when subsequent point is forecast. We render two paths (solid, dashed)
  // by emitting M/L commands per segment.
  let solidPath = "";
  let dashedPath = "";
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
    if (b.forecast) dashedPath += " " + seg;
    else solidPath += " " + seg;
  }

  const gridLines = 4;
  const gridStep = maxVal / gridLines;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
      {Array.from({ length: gridLines + 1 }, (_, i) => {
        const y = padding.top + chartH - (chartH * (gridStep * i)) / maxVal;
        return (
          <g key={i}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--divider)" strokeDasharray="3 3" />
            <text x={padding.left - 8} y={y + 3} textAnchor="end" style={{ ...mono, fontSize: 8, fill: "var(--text-muted)" }}>
              {fmt(gridStep * i)}
            </text>
          </g>
        );
      })}
      {solidPath && <path d={solidPath} fill="none" stroke="var(--accent)" strokeWidth={2} />}
      {dashedPath && <path d={dashedPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="5 4" opacity={0.7} />}
      {points.map((pt, i) => (
        <g key={i}>
          <circle cx={pt.x} cy={pt.y} r={3} fill={pt.forecast ? "var(--bg-surface)" : "var(--accent)"} stroke="var(--accent)" strokeWidth={1.5}>
            <title>{`${pt.label}: ${fmt(pt.value)}${pt.forecast ? " (forecast)" : ""}`}</title>
          </circle>
          {i % Math.ceil(points.length / 8 || 1) === 0 && (
            <text x={pt.x} y={height - padding.bottom + 14} textAnchor="middle" style={{ ...mono, fontSize: 8, fill: "var(--text-muted)" }}>
              {pt.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function DonutChartSVG({ segments, size = 180, innerRadius = 50, outerRadius = 72 }) {
  if (!segments || segments.length === 0) return null;
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  let cumulativeAngle = -Math.PI / 2;

  const arcs = segments.map((seg) => {
    const angle = (seg.value / total) * 2 * Math.PI;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle = endAngle;

    const x1 = cx + outerRadius * Math.cos(startAngle);
    const y1 = cy + outerRadius * Math.sin(startAngle);
    const x2 = cx + outerRadius * Math.cos(endAngle);
    const y2 = cy + outerRadius * Math.sin(endAngle);
    const ix1 = cx + innerRadius * Math.cos(endAngle);
    const iy1 = cy + innerRadius * Math.sin(endAngle);
    const ix2 = cx + innerRadius * Math.cos(startAngle);
    const iy2 = cy + innerRadius * Math.sin(startAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const path = [
      `M ${x1} ${y1}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${ix1} ${iy1}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      `Z`,
    ].join(" ");

    return { ...seg, path, pct: ((seg.value / total) * 100).toFixed(0) };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, maxWidth: "100%" }}>
        {arcs.map((arc, i) => (
          <path key={i} d={arc.path} fill={arc.color} stroke="var(--bg-surface)" strokeWidth={1.5}>
            <title>{`${arc.label}: ${arc.value} (${arc.pct}%)`}</title>
          </path>
        ))}
        <text x={cx} y={cy - 4}  textAnchor="middle" style={{ ...mono, fontSize: 16, fontWeight: 700, fill: "var(--text-primary)" }}>{total}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" style={{ ...mono, fontSize: 9,  fill: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total</text>
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", justifyContent: "center" }}>
        {arcs.map((arc, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: arc.color }} />
            <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)" }}>
              {arc.label} ({arc.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
