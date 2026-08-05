/**
 * Pure size/variant tokens for design-system Button.
 */

export const BUTTON_SIZES = {
  sm: { h: 26, px: 10, fs: 9 },
  md: { h: 30, px: 12, fs: 10 },
  lg: { h: 34, px: 16, fs: 11 },
} as const;

export const BUTTON_VARIANTS = {
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
} as const;
