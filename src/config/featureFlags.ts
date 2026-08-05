export const FEATURE_FLAG_KEYS = [
  "account_deletion",
  "revision_ai_diff",
  "submittal_approved_to_scrub",
  "submittal_drawing_types",
  "submittal_revision_autobump",
  "submittal_splitting",
  "submittal_workday_dues",
  "viewer_3d",
  // Scope-cut module gates (see src/config/moduleGating.js)
  "module_email_inbox",
  "module_integrations",
  "module_cost",
  "module_quality",
  "module_resources",
  "module_closeout",
  "module_procurement",
  "module_meetings",
  "module_risk",
  "module_advanced_reports",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

