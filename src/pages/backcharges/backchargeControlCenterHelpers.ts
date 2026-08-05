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

/** Format a dollar amount for backcharge display (no cents unless non-zero path uses 0 max). */
export function formatBackchargeMoney(n: number | null | undefined): string {
  if (!n && n !== 0) return "$—";
  return `$${Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

