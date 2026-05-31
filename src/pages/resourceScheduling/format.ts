import { formatLocalDate } from "@/utils/dates";
export function formatHours(value: unknown): string {
  return `${Math.round(Number(value) || 0).toLocaleString()}h`;
}

export function formatShortDate(value: unknown): string {
  if (!value) return "No booking";
  return formatLocalDate(value as string, "en-US", { month: "short", day: "numeric" });
}
