/**
 * ProgressBar — slim progress indicator with optional subtext below.
 * Default 6px height; use 3–4 for inline row variants.
 */

import React from "react";

export default function ProgressBar({ value, color = "var(--accent)", height = 6, sub, label }) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `${clamped}% complete`}
        style={{
          height,
          background: "var(--bg-surface-high)",
          borderRadius: Math.floor(height / 2),
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: color,
            boxShadow: `0 0 8px ${color}40`,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            marginTop: 4,
            letterSpacing: "0.04em",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
