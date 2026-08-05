export type ApprovalPillTone = "good" | "review" | "neutral" | "warn";

export function statusTone(status?: string | null): ApprovalPillTone {
  switch (status) {
    case "Approved":
    case "Approved as Noted":
    case "Released for Fabrication":
      return "good";
    case "Rejected":
    case "Revise and Resubmit":
      return "review";
    case "Void":
      return "neutral";
    default:
      return "warn";
  }
}
