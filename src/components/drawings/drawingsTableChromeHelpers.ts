/** Pure AI extraction status meta for drawings table chrome. */

export const AI_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; border: string; title: string }
> = {
  Pending: {
    label: "QUEUED",
    color: "var(--text-muted)",
    bg: "var(--bg-surface-high)",
    border: "var(--border-default)",
    title: "Queued for AI extraction",
  },
  Extracting: {
    label: "✦ READING",
    color: "var(--status-warning)",
    bg: "color-mix(in srgb, var(--status-warning) 12%, transparent)",
    border: "color-mix(in srgb, var(--status-warning) 35%, transparent)",
    title: "Claude is reading this sheet",
  },
  NeedsReview: {
    label: "REVIEW",
    color: "var(--status-review)",
    bg: "color-mix(in srgb, var(--status-review) 12%, transparent)",
    border: "color-mix(in srgb, var(--status-review) 35%, transparent)",
    title: "AI finished but found something to verify",
  },
  Failed: {
    label: "✗ FAILED",
    color: "var(--status-error)",
    bg: "color-mix(in srgb, var(--status-error) 12%, transparent)",
    border: "color-mix(in srgb, var(--status-error) 35%, transparent)",
    title: "AI extraction failed — click to retry",
  },
};
