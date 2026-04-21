/**
 * KpiTile — click-to-filter metric card.
 *
 * Colored top border + optional icon + big tabular number + label
 * below. When `active`, gets a subtle glow matching the tile color
 * plus a 6px dot badge indicating "this filter is on."
 *
 * `compact` reduces padding + value size (used in multi-tile KPI
 * strips on list pages). Uncompact is the Dashboard hero variant.
 */

import React from "react";
import Icon from "./Icon";

export default function KpiTile({
  label,
  value,
  sub,
  color = "var(--accent)",
  active,
  onClick,
  icon,
  compact,
}) {
  const clickable = !!onClick;

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--bg-surface)",
        borderRadius: "var(--radius-card)",
        borderTop: `2px solid ${color}`,
        border: active ? `1px solid ${color}` : "1px solid var(--border-default)",
        borderTopWidth: 2,
        borderTopColor: color,
        padding: compact ? "10px 12px" : "14px 14px 12px",
        cursor: clickable ? "pointer" : "default",
        boxShadow: active
          ? `0 0 18px color-mix(in srgb, ${color} 20%, transparent), 0 0 36px color-mix(in srgb, ${color} 8%, transparent)`
          : "var(--shadow-card)",
        transition: "all 0.15s",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: compact ? 22 : 26,
              fontWeight: 600,
              color,
              lineHeight: 1,
              marginBottom: 5,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 9,
              fontWeight: 700,
              color: active ? color : "var(--text-muted)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
          {sub && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                color: "var(--text-muted)",
                marginTop: 6,
                letterSpacing: "0.04em",
              }}
            >
              {sub}
            </div>
          )}
        </div>
        {(active || icon) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {icon && <Icon name={icon} size={13} color={color} />}
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
        )}
      </div>
    </div>
  );
}
