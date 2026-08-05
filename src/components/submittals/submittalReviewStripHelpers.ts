/**
 * Pure tone color map for SubmittalReviewStrip.
 */

export const TONE_COLORS: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  success: {
    bg: "var(--success-muted)",
    border: "var(--success-border)",
    text: "var(--status-success)",
  },
  warning: {
    bg: "var(--warning-muted)",
    border: "var(--warning-border)",
    text: "var(--status-warning)",
  },
  error: {
    bg: "var(--danger-muted)",
    border: "var(--danger-border)",
    text: "var(--status-error)",
  },
  muted: {
    bg: "var(--bg-surface-low)",
    border: "var(--border-default)",
    text: "var(--text-muted)",
  },
};
