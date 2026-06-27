/**
 * KpiTile — colored top-border card in the Work Packages KPI strip.
 * When `statusKey` is provided the tile becomes a click-to-filter
 * toggle; the parent owns `filterStatus` and flips it via `onToggle`.
 *
 * An active tile gets a subtle glow + a tiny dot badge so it's obvious
 * which filter is currently driving the list below.
 */

import React from "react";

export default function KpiTile({ label, value, color, statusKey, filterStatus, onToggle }) {
  const clickable = !!statusKey;
  const active = statusKey && filterStatus === statusKey;

  return (
    <div
      onClick={clickable ? () => onToggle(statusKey) : undefined}
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        borderTop: `2px solid ${color}`,
        padding: "14px 12px 12px",
        cursor: clickable ? "pointer" : "default",
        border: active ? `1px solid ${color}` : "1px solid var(--border-default)",
        borderTopWidth: 2,
        borderTopColor: color,
        boxShadow: active
          ? `0 0 16px ${color}33, 0 0 32px ${color}11`
          : "var(--shadow-card)",
        transition: "border-color 0.2s, box-shadow 0.2s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 22,
              fontWeight: 600,
              color,
              marginBottom: 4,
              lineHeight: 1,
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 10,
              fontWeight: 700,
              color: active ? color : "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        </div>
        {active && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: color,
              boxShadow: `0 0 6px ${color}`,
              marginTop: 2,
              flexShrink: 0,
            }}
          />
        )}
      </div>
    </div>
  );
}
