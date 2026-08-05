export type FieldUrgencyPill = "danger" | "warn" | "good" | "neutral" | "info";

export function urgencyTone(bucket: string): FieldUrgencyPill {
  switch (bucket) {
    case "overdue":
      return "danger";
    case "due-today":
      return "warn";
    case "active":
      return "good";
    case "unscheduled":
      return "neutral";
    case "upcoming":
      return "info";
    default:
      return "neutral";
  }
}
