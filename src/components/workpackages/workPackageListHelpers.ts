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
