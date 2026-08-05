export type RegisterPillTone = "good" | "danger" | "warn" | "info" | "neutral";

export function statusTone(status: string | null): RegisterPillTone {
  if (!status) return "neutral";
  if (status === "released_for_field") return "good";
  if (status === "void") return "danger";
  if (status === "released_for_shop" || status === "on_hold" || status === "pending_review") return "warn";
  if (status === "reviewed" || status === "released_for_estimate") return "info";
  return "neutral";
}

export const STATUS_FILTERS = [
  "all",
  "received",
  "pending_review",
  "reviewed",
  "released_for_estimate",
  "released_for_shop",
  "released_for_field",
  "on_hold",
  "superseded",
  "void",
] as const;

export const RELEASE_OPTIONS: { value: string; label: string }[] = [
  { value: "released_for_estimate", label: "Estimate" },
  { value: "released_for_shop", label: "Shop" },
  { value: "released_for_field", label: "Field" },
];
