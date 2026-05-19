/**
 * KpiTile — click-to-filter metric card.
 *
 * SBD treatment: glass surface (translucent white + backdrop-blur), mono
 * uppercase label with wide tracking, large mono value, optional accent
 * top border, soft hover-lift (transform + brighter border) when clickable.
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
  const [hover, setHover] = useState(false);
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
  const borderColor = active
    ? color
    : hover && clickable
      ? "var(--accent-border)"
      : "var(--border-default)";
  const topBorderColor = active
    ? color
    : "color-mix(in srgb, var(--border-default) 80%, white 20%)";

  return (
    <div
      className="sbd-kpi"
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${label}: ${value}` : undefined}
      onClick={onClick}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(); } } : undefined}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 90%, #000 10%) 0%, color-mix(in srgb, var(--bg-surface-low) 84%, #000 16%) 100%)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        borderRadius: 16,
        borderTopStyle: "solid",
        borderRightStyle: "solid",
        borderBottomStyle: "solid",
        borderLeftStyle: "solid",
        borderTopWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderLeftWidth: 1,
        borderTopColor: topBorderColor,
        borderRightColor: borderColor,
        borderBottomColor: borderColor,
        borderLeftColor: borderColor,
        padding: compact ? "12px 14px" : "18px 18px 16px",
        cursor: clickable ? "pointer" : "default",
        boxShadow: active
          ? `0 0 18px color-mix(in srgb, ${color} 18%, transparent), 0 14px 34px rgba(0,0,0,0.34)`
          : hover && clickable
          ? "0 12px 30px rgba(0,0,0,0.36)"
          : "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.26)",
        transform: hover && clickable && !active ? "translateY(-1px)" : "none",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, color-mix(in srgb, ${color} 9%, transparent) 0%, transparent 45%, transparent 100%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              color: active ? color : "var(--text-muted)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              marginBottom: compact ? 10 : 12,
            }}
          >
            {label}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: compact ? 24 : 34,
              fontWeight: 700,
              color,
              lineHeight: 0.94,
              marginBottom: 6,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.03em",
            }}
          >
            {value}
          </div>
          {sub && (
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--text-secondary)",
                marginTop: 6,
                lineHeight: 1.35,
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
            borderTop: "1px solid color-mix(in srgb, var(--text-muted) 12%, transparent)",
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
