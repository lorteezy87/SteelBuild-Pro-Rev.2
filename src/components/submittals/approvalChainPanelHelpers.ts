/** Pure helpers. */

export const APPROVAL_CHAIN_MONO = "var(--font-mono)";

export const STEP_CHIP_PALETTE = {
  done: {
    color: "var(--status-success)",
    border: "color-mix(in srgb, var(--status-success) 45%, transparent)",
    bg: "color-mix(in srgb, var(--status-success) 12%, transparent)",
  },
  current: {
    color: "var(--on-accent)",
    border: "var(--accent)",
    bg: "var(--accent)",
  },
  upcoming: {
    color: "var(--text-muted)",
    border: "var(--border-default)",
    bg: "transparent",
  },
} as const;
