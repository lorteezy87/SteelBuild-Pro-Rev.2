export const FEATURE_FLAG_KEYS = [
  "account_deletion",
  "revision_ai_diff",
  "submittal_approved_to_scrub",
  "submittal_drawing_types",
  "submittal_revision_autobump",
  "submittal_splitting",
  "submittal_workday_dues",
  "viewer_3d",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

