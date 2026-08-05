export type BackchargeTone = "good" | "info" | "warn" | "danger" | "neutral";

export function backchargeTone(status: string | null | undefined): BackchargeTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "notice_sent":
      return "info";
    case "pending":
      return "warn";
    case "disputed":
      return "danger";
    case "approved":
      return "good";
    case "rejected":
      return "neutral";
    case "collected":
      return "good";
    case "void":
      return "neutral";
    default:
      return "neutral";
  }
}
