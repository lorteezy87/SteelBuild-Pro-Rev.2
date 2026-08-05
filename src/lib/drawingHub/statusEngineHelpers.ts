/**
 * Pure thresholds + weight catalogs for drawingHub status / heatmap / readiness.
 */

export const STATUS_THRESHOLDS = {
  RFI_DUE_SOON_DAYS: 3,
  DELIVERY_DUE_SOON_DAYS: 2,
  AI_WARN_CONFIDENCE: 0.8,
} as const;

export const HEATMAP_WEIGHTS = {
  rfiOverdue: 5,
  inspFailed: 4,
  wpBlocked: 4,
  delLate: 3,
  rfiOpen: 2,
  delPending: 1,
  wpActive: 1,
  otherActivity: 0.25,
} as const;

export const READINESS_DRAWING_STAGE_SCORES: Record<string, number> = {
  Released: 100,
  IFC: 100, // alias for Released per elsewhere in app
  OFS: 60,
  BFA: 40,
  OFA: 20,
  IFA: 10,
  "Not Started": 0,
};
