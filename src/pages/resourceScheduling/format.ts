export function formatHours(value: unknown): string {
  return `${Math.round(Number(value) || 0).toLocaleString()}h`;
}

export function formatShortDate(value: unknown): string {
  if (!value) return "No booking";
  return new Date(value as string).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
