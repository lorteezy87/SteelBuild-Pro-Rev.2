/**
 * Button — compact mono-uppercase button with 5 variants.
 *
 * SBD treatment:
 *   primary   — gradient steel-blue with bright inset highlight + drop
 *               shadow, dark text. Mirrors the SBD `sbd-btn-primary`.
 *   secondary — translucent glass surface + soft border, brightens on
 *               hover. Mirrors `sbd-btn`.
 *   ghost     — fully transparent until hover, then glass.
 *   outline   — accent-bordered transparent (AI / import affordances).
 *   danger    — red-muted fill + border (destructive).
 *
 * Size scale: sm (h26 / 9pt) · md (h30 / 10pt) · lg (h34 / 11pt).
 * Always monospace, uppercase, letter-spaced.
 */

import React, { useState } from "react";
import Icon from "./Icon";

const SIZES = {
  sm: { h: 26, px: 10, fs: 9 },
  md: { h: 30, px: 12, fs: 10 },
  lg: { h: 34, px: 16, fs: 11 },
};

// Each variant carries `bg`/`fg`/`border` for the resting state plus a
// `hoverBg`/`hoverBorder`/`hoverShadow` overlay applied via mouse events.
// Keeps the SBD gradient + inset-shadow trick possible without inline
// `:hover` (we don't have a styled-components layer here).
const VARIANTS = {
  primary: {
    bg: "linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 70%, #000 30%) 100%)",
    fg: "#061018",
    border: "var(--accent-border)",
    shadow: "0 6px 20px color-mix(in srgb, var(--accent) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
    hoverBg: "linear-gradient(135deg, var(--accent-light) 0%, var(--accent) 100%)",
    hoverBorder: "var(--accent)",
    hoverShadow: "0 10px 28px color-mix(in srgb, var(--accent) 45%, transparent), inset 0 1px 0 rgba(255,255,255,0.30)",
  },
  secondary: {
    bg: "var(--bg-surface)",
    fg: "var(--text-primary)",
    border: "var(--border-default)",
    shadow: "none",
    hoverBg: "var(--bg-surface-high)",
    hoverBorder: "var(--border-strong, rgba(255,255,255,0.16))",
    hoverShadow: "none",
  },
  ghost: {
    bg: "transparent",
    fg: "var(--text-secondary)",
    border: "transparent",
    shadow: "none",
    hoverBg: "var(--bg-surface)",
    hoverBorder: "transparent",
    hoverShadow: "none",
  },
  outline: {
    bg: "transparent",
    fg: "var(--accent)",
    border: "var(--accent-border)",
    shadow: "none",
    hoverBg: "var(--accent-muted)",
    hoverBorder: "var(--accent)",
    hoverShadow: "none",
  },
  danger: {
    bg: "var(--danger-muted)",
    fg: "var(--danger)",
    border: "var(--danger-border)",
    shadow: "none",
    hoverBg: "color-mix(in srgb, var(--danger) 18%, transparent)",
    hoverBorder: "var(--danger)",
    hoverShadow: "none",
  },
};

export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  onClick,
  disabled,
  title,
  type = "button",
  style: styleOverride,
}) {
  const s = SIZES[size] || SIZES.md;
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const [hover, setHover] = useState(false);
  const isHover = hover && !disabled;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        background: isHover ? v.hoverBg : v.bg,
        color: v.fg,
        border: `1px solid ${isHover ? v.hoverBorder : v.border}`,
        borderRadius: "var(--radius-btn)",
        boxShadow: isHover ? v.hoverShadow : v.shadow,
        backdropFilter: variant === "secondary" || variant === "ghost" ? "blur(12px) saturate(140%)" : undefined,
        WebkitBackdropFilter: variant === "secondary" || variant === "ghost" ? "blur(12px) saturate(140%)" : undefined,
        fontFamily: "var(--font-mono)",
        fontSize: s.fs,
        fontWeight: 700,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, transform 0.12s ease",
        transform: isHover && variant === "primary" ? "translateY(-1px)" : "none",
        whiteSpace: "nowrap",
        ...styleOverride,
      }}
    >
      {icon && <Icon name={icon} size={11} color={v.fg} />}
      {children}
    </button>
  );
}
