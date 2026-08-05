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
