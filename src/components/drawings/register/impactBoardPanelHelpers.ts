export type ImpactPillTone = "danger" | "warn" | "info" | "neutral";

export function priorityTone(priority: string): ImpactPillTone {
  switch (priority) {
    case "critical":
      return "danger";
    case "high":
      return "warn";
    case "medium":
      return "info";
    default:
      return "neutral"; // low
  }
}
