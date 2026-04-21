/**
 * MiniProgressBar — compact inline progress bar with a trailing
 * percentage label. Used in the "WP Progress" column of the
 * project-status matrix.
 */

import React from "react";
import { mono } from "./constants";

export default function MiniProgressBar({ pct, color = "var(--accent)" }) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "var(--bg-surface-high)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            width: `${clamped}%`,
            height: "100%",
            background: color,
            borderRadius: 3,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ ...mono, fontSize: 8, color: "var(--text-muted)", minWidth: 28, textAlign: "right" }}>
        {clamped.toFixed(0)}%
      </span>
    </div>
  );
}
