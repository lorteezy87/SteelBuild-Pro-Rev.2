/** Pure chrome constants for Detailing triage board panels. */

export const ELEMENT_BUCKET_ORDER = [
  "rfi_blocked",
  "behind_schedule",
  "in_detailing",
  "in_review",
  "fab_ready",
  "erection_ready",
  "unmapped",
] as const;

export const DRILLDOWN_ROW_CAP = 100;

export const SCHEDULE_ROWS: Array<[string, string]> = [
  ["detailingStart", "Detailing start"],
  ["internalReviewDue", "Internal review"],
  ["submitBy", "Submit by"],
  ["approvalNeededBy", "Approval by"],
  ["fabReleaseRequiredBy", "Fab release by"],
  ["erectionReleaseRequiredBy", "Erection release by"],
];


