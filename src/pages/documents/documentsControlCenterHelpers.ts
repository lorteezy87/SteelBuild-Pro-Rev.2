/** Document status → command pill tone. */
export function statusToneForDoc(
  status?: string | null,
): "good" | "warn" | "danger" | "neutral" | "info" {
  switch (status) {
    case "Approved":
    case "Approved with Comments":
    case "Issued":
      return "good";
    case "Under Review":
    case "Revise & Resubmit":
      return "warn";
    case "Rejected":
    case "Void":
      return "danger";
    case "Draft":
      return "info";
    default:
      return "neutral";
  }
}

export const KNOWN_CATEGORIES = [
  "All",
  "Structural",
  "Electrical",
  "Civil",
  "Mechanical",
  "Architectural",
  "General",
] as const;
