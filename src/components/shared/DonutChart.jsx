import React from "react";

/**
 * SVG donut/ring chart — lightweight, no dependencies.
 * @param {number} value   Current value (0–max)
 * @param {number} max     Maximum value (default 100)
 * @param {number} size    Diameter in px (default 56)
 * @param {number} stroke  Stroke width in px (default 5)
 * @param {string} color   Fill color (CSS variable or hex)
 * @param {string} label   Center label text (optional, defaults to percentage)
 * @param {string} trackColor  Background ring color
 */
export default function DonutChart({
  value = 0,
  max = 100,
  size = 56,
  stroke = 5,
  color = "var(--accent)",
  label,
  trackColor = "var(--bg-surface-high)",
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference * (1 - pct);
  const displayLabel = label ?? `${Math.round(pct * 100)}%`;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-mono)",
          fontSize: size < 48 ? 9 : 11,
          fontWeight: 700,
          color: "var(--text-primary)",
          letterSpacing: "0.02em",
        }}
      >
        {displayLabel}
      </div>
    </div>
  );
}
