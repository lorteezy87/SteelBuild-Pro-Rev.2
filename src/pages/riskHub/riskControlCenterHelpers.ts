/** Pure helpers for RiskControlCenter. */

export function severityTone(
  severity: string | null | undefined,
): "danger" | "warn" | "neutral" {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warn";
  return "neutral";
}

export function mitigationTone(
  status: string | null | undefined,
): "good" | "warn" | "neutral" {
  if (!status) return "neutral";
  if (status === "In Progress") return "warn";
  if (status === "Open") return "neutral";
  return "neutral";
}
