/**
 * KpiTile — click-to-filter metric card.
 *
 * Colored top border + optional icon + big tabular number + label
 * below. When `active`, gets a subtle glow matching the tile color
 * plus a 6px dot badge indicating "this filter is on."
 *
 * `compact` reduces padding + value size (used in multi-tile KPI
 * strips on list pages). Uncompact is the Dashboard hero variant.
 *
 * Trust affordances (both optional):
 *   - `source`    — short label naming where the number came from,
 *                   e.g. "schedule_tasks" or "rfis + dependencies".
 *                   Rendered in small mono caps with a leading dot.
 *   - `updatedAt` — Date / ISO string / epoch ms of the most recent
 *                   data fetch. Rendered as relative time
 *                   ("Updated 2m ago"). Omit for static values.
 *   - `confidence` — optional "high" | "medium" | "low" badge for
 *                    derived / estimated numbers. Rendered right-
 *                    aligned; color-coded. Use this sparingly — only
 *                    on forecasts, not on hard counts.
 */

import React, { useEffect, useState } from "react";
import Icon from "./Icon";

// Relative time helper. Re-exports to a small string: "just now", "2m ago",
// "1h ago", "3d ago", or falls back to a date stamp past 30d so the label
// doesn't degenerate into "300d ago" for very stale tiles.
function formatRelative(input) {
  if (input === null || input === undefined) return null;
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return "just now"; // clock skew — don't embarrass ourselves
  const s = Math.floor(diff / 1000);
  if (s < 30) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days <= 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

const CONFIDENCE_COLOR = {
  high:   "var(--status-success)",
  medium: "var(--status-warning)",
  low:    "var(--status-error)",
};

export default function KpiTile({
  label,
  value,
  sub,
  color = "var(--accent)",
  active,
  onClick,
  icon,
  compact,
  source,
  updatedAt,
  confidence,
}) {
  // Re-tick relative time every 30s so "just now" → "1m ago" lands without
  // a manual reload. Tiles are lightweight; the refresh is cheap.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!updatedAt) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, [updatedAt]);
  const relLabel = updatedAt ? formatRelative(updatedAt) : null;
  // `tick` is read here so React doesn't complain about an unused state
  // value; the side effect is the re-render itself.
  void tick;
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
        {(active || icon || confidence) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {confidence && CONFIDENCE_COLOR[confidence] && (
              <span
                title={`${confidence.charAt(0).toUpperCase() + confidence.slice(1)} confidence`}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 800,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: CONFIDENCE_COLOR[confidence],
                  border: `1px solid ${CONFIDENCE_COLOR[confidence]}`,
                  borderRadius: 2,
                  padding: "1px 4px",
                  opacity: 0.8,
                }}
              >
                {confidence === "high" ? "hi" : confidence === "medium" ? "md" : "lo"}
              </span>
            )}
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
      {/* Trust footer — only renders when at least one trust affordance
          is set. Muted colour + small type so it doesn't distract from
          the hero number but is there when a PM asks "where's this from
          and how fresh is it?". Both bits on the same line; divider dot
          between only when both are present. */}
      {(source || relLabel) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: compact ? 5 : 7,
            paddingTop: compact ? 5 : 6,
            borderTop: "1px dashed color-mix(in srgb, var(--text-muted) 20%, transparent)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
          title={[
            source ? `Source: ${source}` : null,
            updatedAt ? `Last updated ${formatRelative(updatedAt)}` : null,
          ].filter(Boolean).join(" · ")}
        >
          {source && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ width: 4, height: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{source}</span>
            </span>
          )}
          {source && relLabel && <span aria-hidden>·</span>}
          {relLabel && <span>{relLabel}</span>}
        </div>
      )}
    </div>
  );
}
