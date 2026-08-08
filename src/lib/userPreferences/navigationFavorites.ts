import { SIDEBAR_GROUPS } from "@/config/moduleRegistry";

export type NavigationFavoriteOption = { id: string; label: string };

export const NAVIGATION_FAVORITE_OPTIONS: NavigationFavoriteOption[] = SIDEBAR_GROUPS.flatMap(
  (group: { items?: Array<{ page: string; label: string }> }) =>
    (group.items ?? []).map((item) => ({ id: item.page, label: item.label })),
);

export const NAVIGATION_FAVORITE_IDS = NAVIGATION_FAVORITE_OPTIONS.map((option) => option.id);

const LEGACY_FAVORITE_ALIASES: Record<string, string> = {
  Projects: "ProjectsHub",
  Drawings: "DrawingSubmittalHub",
  Submittals: "DrawingSubmittalHub",
  Schedule: "ScheduleHub",
  Reports: "ReportsHub",
  Risks: "RiskHub",
  Financials: "CostHub",
  Fabrication: "WorkPackages",
  DailyLogs: "FieldHub",
  Safety: "FieldHub",
  Punchlist: "FieldHub",
};

export function normalizeNavigationFavorites(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(NAVIGATION_FAVORITE_IDS);
  return [...new Set(value
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .map((item) => LEGACY_FAVORITE_ALIASES[item] ?? item)
    .filter((item) => allowed.has(item)))];
}
