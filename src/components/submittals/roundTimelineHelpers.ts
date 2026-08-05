/**
 * Pure status colors and date helpers for RoundTimeline.
 */

export const ROUND_STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  Draft: {
    color: "var(--text-muted)",
    bg: "color-mix(in srgb, var(--text-muted) 16%, transparent)",
  },
  Submitted: { color: "var(--status-info)", bg: "var(--info-muted)" },
  "Under Review": { color: "var(--accent)", bg: "var(--accent-muted)" },
  Approved: { color: "var(--status-success)", bg: "var(--success-muted)" },
  "Approved as Noted": {
    color: "var(--status-success-bright)",
    bg: "color-mix(in srgb, var(--status-success-bright) 18%, transparent)",
  },
  "Revise and Resubmit": {
    color: "var(--status-review)",
    bg: "var(--status-review-muted)",
  },
  Rejected: { color: "var(--status-error)", bg: "var(--danger-muted)" },
  "Released for Fabrication": {
    color: "var(--status-info)",
    bg: "var(--info-muted)",
  },
  Void: {
    color: "var(--text-muted)",
    bg: "color-mix(in srgb, var(--text-muted) 14%, transparent)",
  },
};

export const DEFAULT_COLOR = {
  color: "var(--text-muted)",
  bg: "color-mix(in srgb, var(--text-muted) 16%, transparent)",
};

export function daysBetween(
  isoA: string | null | undefined,
  isoB: string | null | undefined,
): number | null {
  if (!isoA || !isoB) return null;
  const a = new Date(isoA);
  const b = new Date(isoB);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round(Math.abs(b.getTime() - a.getTime()) / 86_400_000);
}
