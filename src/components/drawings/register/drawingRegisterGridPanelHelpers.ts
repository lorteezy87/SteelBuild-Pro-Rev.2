export type RegisterPillTone = "good" | "danger" | "warn" | "info" | "neutral";

export function statusTone(status: string | null): RegisterPillTone {
  if (!status) return "neutral";
  if (status === "released_for_field") return "good";
  if (status === "void") return "danger";
  if (status === "released_for_shop" || status === "on_hold" || status === "pending_review") return "warn";
  if (status === "reviewed" || status === "released_for_estimate") return "info";
  return "neutral";
}
