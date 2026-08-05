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

/** Pure URLSearchParams mutator for field_tab. */
export function nextFieldTabParams(
  prev: URLSearchParams | Record<string, string> | string,
  key: string,
): URLSearchParams {
  const next = new URLSearchParams(prev as any);
  if (key === "hub") next.delete("field_tab");
  else next.set("field_tab", key);
  next.delete("id");
  return next;
}

/** Deep-link open record: set tab + id. */
export function nextOpenRecordParams(
  prev: URLSearchParams | Record<string, string> | string,
  tabKey: string,
  id: string,
): URLSearchParams {
  const next = new URLSearchParams(prev as any);
  next.set("field_tab", tabKey);
  next.set("id", id);
  return next;
}

/** Open create flow on a register tab (`?new=1`). */
export function nextNewRecordParams(
  prev: URLSearchParams | Record<string, string> | string,
  tabKey: string,
): URLSearchParams {
  const next = new URLSearchParams(prev as any);
  next.set("field_tab", tabKey);
  next.set("new", "1");
  return next;
}

