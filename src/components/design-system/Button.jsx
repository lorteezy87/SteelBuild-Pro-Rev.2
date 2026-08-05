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
import { BUTTON_SIZES as SIZES, BUTTON_VARIANTS as VARIANTS } from "./buttonHelpers";


export default function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  onClick,
  disabled,
  title,
  type = "button",
  "aria-label": ariaLabel,
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
      aria-label={ariaLabel}
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
