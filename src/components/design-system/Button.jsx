/**
 * Button — compact mono-uppercase button with 5 variants.
 *
 *   primary   — gold fill, dark text (hero action)
 *   secondary — subtle surface fill (default action)
 *   ghost     — transparent, no border
 *   outline   — gold-bordered transparent (AI action, import)
 *   danger    — red-muted fill + border (destructive)
 *
 * Size scale: sm (h26 / 9pt) · md (h30 / 10pt) · lg (h34 / 11pt).
 * Always monospace, uppercase, letter-spaced.
 */

import React from "react";
import Icon from "./Icon";

const SIZES = {
  sm: { h: 26, px: 10, fs: 9 },
  md: { h: 30, px: 12, fs: 10 },
  lg: { h: 34, px: 16, fs: 11 },
};

const VARIANTS = {
  primary:   { bg: "var(--accent)",         fg: "#0B0E11",                border: "var(--accent)" },
  secondary: { bg: "var(--bg-surface-low)", fg: "var(--text-secondary)",  border: "var(--border-default)" },
  ghost:     { bg: "transparent",           fg: "var(--text-secondary)",  border: "transparent" },
  outline:   { bg: "transparent",           fg: "var(--accent)",          border: "var(--accent-border)" },
  danger:    { bg: "var(--danger-muted)",   fg: "var(--danger)",          border: "var(--danger-border)" },
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

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        background: v.bg,
        color: v.fg,
        border: `1px solid ${v.border}`,
        borderRadius: "var(--radius-btn)",
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
        transition: "all 0.12s",
        whiteSpace: "nowrap",
        ...styleOverride,
      }}
      onMouseEnter={(e) => {
        if (!disabled && variant === "primary") e.currentTarget.style.background = "var(--accent-light)";
      }}
      onMouseLeave={(e) => {
        if (!disabled && variant === "primary") e.currentTarget.style.background = "var(--accent)";
      }}
    >
      {icon && <Icon name={icon} size={11} color={v.fg} />}
      {children}
    </button>
  );
}
