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

export const IMPACT_TYPES = [
  "fabrication",
  "erection",
  "embed",
  "anchor_bolts",
  "connections",
  "material_takeoff",
  "shop_drawing_required",
  "rfi_followup",
  "change_order",
  "field_rework",
] as const;

export const IMPACT_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export const IMPACT_STATUS_ACCENT: Record<string, string> = {
  open: "var(--cmd-warn)",
  in_review: "var(--cmd-info)",
  ready: "var(--cmd-good)",
  blocked: "var(--cmd-danger)",
  resolved: "var(--cmd-text-muted)",
  closed: "var(--cmd-text-muted)",
};

