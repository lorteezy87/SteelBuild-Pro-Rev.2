/** Pure helpers for Reports hub shell. */

export const REPORT_CATEGORY_ACCENT: Record<string, string> = {
  Portfolio: "var(--status-info)",
  Financial: "var(--status-info)",
  Risk: "var(--status-error)",
  Schedule: "var(--accent)",
  Cost: "var(--status-success)",
  Team: "var(--accent-light)",
};

export function categoryAccent(category: string | null | undefined): string {
  return REPORT_CATEGORY_ACCENT[category || ""] || "var(--accent)";
}

export type ReportEntryLike = {
  category?: string | null;
  slug?: string;
  [key: string]: unknown;
};

export function reportsForCategory<T extends ReportEntryLike>(
  reports: T[],
  category: string,
): T[] {
  return (reports || []).filter((r) => r.category === category);
}
