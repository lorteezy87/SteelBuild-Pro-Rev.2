/**
 * PriorityBar — stacked single-bar chart showing the open-constraint
 * priority breakdown, with a legend underneath. Renders null if there
 * are no open constraints (caller already short-circuits on that, but
 * defensive null check here too).
 */

import React from "react";
import { PRIORITY_CONFIG } from "./constants";

export default function PriorityBar({ byPriority }) {
  const openTotal = byPriority.reduce((s, p) => s + p.count, 0);
  if (!openTotal) return null;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        Open Constraint Priority Distribution
      </div>
      <div style={{ display: "flex", height: 8, borderRadius: "var(--radius-card)", overflow: "hidden", background: "var(--bg-surface-high)" }}>
        {byPriority.map((p) => {
          const width = openTotal ? Math.max((p.count / openTotal) * 100, 3) : 0;
          return (
            <div
              key={p.priority}
              style={{
                width: `${width}%`,
                background: PRIORITY_CONFIG[p.priority].dot,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
        {byPriority.map((p) => (
          <div key={p.priority} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: PRIORITY_CONFIG[p.priority].dot,
              }}
            />
            <span style={{ color: PRIORITY_CONFIG[p.priority].color }}>{p.priority}</span>
            <span>{p.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
