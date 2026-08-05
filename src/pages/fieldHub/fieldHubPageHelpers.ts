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

/** Tab keys/labels for Field Hub (components stay on the page shell). */
export const FIELD_HUB_TAB_DEFS = [
  { key: "today", label: "Today" },
  { key: "overview", label: "Overview" },
  { key: "dailylogs", label: "Daily Logs" },
  { key: "photos", label: "Photos" },
  { key: "lems", label: "LEMs" },
  { key: "inspections", label: "Inspections" },
  { key: "punchlist", label: "Punchlist" },
  { key: "quality", label: "Quality Control" },
  { key: "safety", label: "Safety" },
] as const;

export type FieldHubTabKey = (typeof FIELD_HUB_TAB_DEFS)[number]["key"];
