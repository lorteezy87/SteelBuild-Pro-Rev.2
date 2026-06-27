import React from "react";

export default function HealthScoreGauge({ score = 75, size = 120, showLabel = true }) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference * (1 - score / 100);

  let color, label, statusColor;
  if (score >= 80) {
    color = "var(--status-success)";
    label = "HEALTHY";
    statusColor = "var(--success-muted)";
  } else if (score >= 60) {
    color = "var(--status-warning)";
    label = "WATCH";
    statusColor = "var(--warning-muted)";
  } else if (score >= 40) {
    color = "var(--status-warning)";
    label = "AT RISK";
    statusColor = "var(--warning-muted)";
  } else {
    color = "var(--status-error)";
    label = "CRITICAL";
    statusColor = "var(--danger-muted)";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg
        width={size}
        height={size}
        style={{
          transform: "rotate(-90deg)",
        }}
      >
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={45}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth="6"
        />

        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={45}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 0.6s ease-out",
            filter: `drop-shadow(0 0 8px ${color}88)`,
          }}
        />

        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dy="0.3em"
          style={{
            fontSize: size * 0.35,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fill: color,
          }}
        >
          {Math.round(score)}
        </text>
      </svg>

      {showLabel && (
        <div
          style={{
            background: statusColor,
            border: `1px solid ${color}44`,
            borderRadius: 6,
            padding: "3px 10px",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 700,
            color: color,
            letterSpacing: "0.08em",
            textAlign: "center",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}