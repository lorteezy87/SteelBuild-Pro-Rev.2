/** Pure helpers for ResourcesControlCenter. */

export type ResourceKpiTone = "good" | "warn" | "danger" | "info" | "neutral";

export function availabilityTone(av: string): ResourceKpiTone {
  if (av === "Over-Allocated") return "danger";
  if (av === "Allocated" || av === "Committed") return "warn";
  if (av === "Available") return "good";
  if (av === "Partially Available") return "info";
  return "neutral";
}

export const TYPE_FILTERS = ["All", "Person", "Crew", "Labor", "Equipment", "Bay", "Subcontractor", "Material"] as const;
