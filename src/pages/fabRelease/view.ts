import { FAB_STAGES } from "./analytics";

export const FAB_RELEASE_VIEW_IDS = ["flow", "board", "register", "hours"] as const;

export type FabReleaseViewId = (typeof FAB_RELEASE_VIEW_IDS)[number];

export function normalizeFabReleaseView(value: string | null | undefined): FabReleaseViewId | null {
  const normalized = value === "pipeline" ? "flow" : value === "list" ? "register" : value;
  return normalized && FAB_RELEASE_VIEW_IDS.includes(normalized as FabReleaseViewId)
    ? normalized as FabReleaseViewId
    : null;
}

export function normalizeFabReleaseStage(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value === "all") return "all";

  return FAB_STAGES.find(
    (stage) => stage.id === value || stage.short.toLowerCase() === value.toLowerCase(),
  )?.id ?? null;
}
