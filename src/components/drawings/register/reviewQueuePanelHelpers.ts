export type ReviewPillTone = "warn" | "good" | "info" | "danger" | "neutral";

export function decisionTone(decision: string): ReviewPillTone {
  switch (decision) {
    case "pending":
      return "warn";
    case "approved":
      return "good";
    case "approved_with_notes":
      return "info";
    case "rejected":
      return "danger";
    default:
      return "neutral"; // not_required
  }
}

export const REVIEW_ROLES = [
  "project_manager",
  "detailer",
  "shop",
  "field_ops",
  "document_control",
  "executive",
] as const;

export const DECIDE_OPTIONS = [
  "approved",
  "approved_with_notes",
  "rejected",
  "not_required",
] as const;

