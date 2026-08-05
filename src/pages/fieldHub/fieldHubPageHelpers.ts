import { findById } from "@/pages/shared/findById";
import { filterLiveRecords } from "@/pages/shared/filterLiveRecords";
import { resolveHubTabKey } from "@/pages/hubs/hubTabHelpers";

/** Pure helpers for FieldHub page shell. */

/** Alias — same soft-delete filter as shared filterLiveRecords. */
export const filterLiveFieldRecords = filterLiveRecords;


export function resolveFieldHubTabKey(
  param: string | null | undefined,
  tabKeys: string[],
): string {
  return resolveHubTabKey(param, tabKeys, "hub");
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
