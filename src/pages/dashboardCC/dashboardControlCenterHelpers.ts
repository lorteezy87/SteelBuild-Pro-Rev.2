/** Pure helpers for DashboardControlCenter. */

export type DashPillTone = "neutral" | "good" | "warn" | "danger" | "info";

export function activityTone(tone: string): DashPillTone {
  if (tone === "approved") return "good";
  if (tone === "waiting") return "warn";
  if (tone === "open") return "danger";
  if (tone === "progress") return "info";
  return "neutral";
}

export function alertPriorityTone(
  priority: "high" | "medium" | "low",
): DashPillTone {
  if (priority === "high") return "danger";
  if (priority === "medium") return "warn";
  return "neutral";
}
