/**
 * Pure thresholds for drawingHub status / heatmap rules.
 */

export const STATUS_THRESHOLDS = {
  RFI_DUE_SOON_DAYS: 3,
  DELIVERY_DUE_SOON_DAYS: 2,
  AI_WARN_CONFIDENCE: 0.8,
} as const;
