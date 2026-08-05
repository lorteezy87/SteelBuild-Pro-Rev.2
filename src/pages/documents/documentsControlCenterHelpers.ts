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

/** Chrome for list-view file-type badges. */
export function fileTypeBadgeStyle(
  bg: string,
  color: string,
): Record<string, string | number> {
  return {
    display: "inline-block",
    padding: "1px 6px",
    borderRadius: 3,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    background: bg,
    color,
  };
}

/** Format a date for the documents control center list. */
export function formatDocsListDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

