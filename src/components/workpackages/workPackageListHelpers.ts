/**
 * Pure phase/status/stage chrome maps for WorkPackageList.
 */

export const PHASE_COLORS: Record<string, string> = {
  Detailing: "var(--status-info)",
  Fabrication: "var(--status-warning)",
  Delivery: "var(--accent)",
  Erection: "var(--status-success)",
};

export const STATUS_COLORS: Record<string, string> = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

/** Corrected 7-stage flow (migration 077): Not Started → IFA → OFA → BFA → OFS → IFC → Released. */
export const STAGE_STYLES: Record<string, { bg: string; color: string }> = {
  "Not Started": { bg: "rgba(144,144,149,0.12)", color: "var(--text-muted)" },
  IFA: { bg: "rgba(96,165,250,0.12)", color: "var(--status-info)" },
  OFA: { bg: "rgba(0,229,255,0.12)", color: "var(--status-info)" },
  BFA: { bg: "rgba(255,185,95,0.12)", color: "var(--status-warning)" },
  OFS: { bg: "rgba(68,226,205,0.12)", color: "var(--secondary)" },
  IFC: { bg: "rgba(52,211,153,0.15)", color: "var(--status-success)" },
  Released: { bg: "rgba(168,240,203,0.12)", color: "var(--status-success)" },
};

/** Color for actual vs budget hours (under = success, over = error). */
export function hoursBudgetColor(
  actual: number | string | null | undefined,
  budget: number | string | null | undefined,
): string {
  if (!budget) return "var(--text-muted)";
  return Number(actual || 0) <= Number(budget || 0)
    ? "var(--status-success)"
    : "var(--status-error)";
}

/** Percent of budget consumed, capped at 100. */
export function hoursBudgetPct(
  actual: number | string | null | undefined,
  budget: number | string | null | undefined,
): number {
  if (!budget) return 0;
  return Math.min(100, Math.round(((Number(actual) || 0) / Number(budget)) * 100));
}

