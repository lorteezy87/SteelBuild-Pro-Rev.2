import { findById } from "@/pages/shared/findById";
/** Pure helpers for FieldHub page shell. */

export function filterLiveFieldRecords<T extends { is_deleted?: boolean | null }>(
  rows: T[] | null | undefined,
): T[] {
  return (rows || []).filter((r) => !r.is_deleted);
}

export function resolveFieldHubTabKey(
  param: string | null | undefined,
  tabKeys: string[],
): string {
  return tabKeys.includes(param || "") ? (param as string) : "hub";
}

export function resolveProjectName(
  projects: Array<{ id?: string; name?: string | null }>,
  projectId: string | null | undefined,
  fallback = "All Projects",
): string {
  return findById(projects, projectId)?.name || fallback;
}

export function buildFieldHubVisibleTabs<T extends { key: string; label: string }>(
  tabs: T[],
): Array<T | { key: "hub"; label: string; Component: null }> {
  return [{ key: "hub", label: "Command Center", Component: null }, ...tabs];
}
