export function categoryTone(
  cat: string,
): "danger" | "warn" | "good" | "info" | "neutral" {
  switch (cat) {
    case "Risk":
      return "danger";
    case "Financial":
    case "Cost":
      return "good";
    case "Schedule":
      return "warn";
    case "Portfolio":
      return "info";
    default:
      return "neutral";
  }
}

export const CATEGORY_FILTERS = [
  "All",
  "Portfolio",
  "Financial",
  "Risk",
  "Schedule",
  "Cost",
  "Team",
] as const;
