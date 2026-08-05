/**
 * Pure helpers for Project Closeout page shell.
 */

export const PROJECT_CLOSEOUT_COMMAND_SUBTITLE =
  "Handover checklist · final billing summary · lessons learned";

export const PROJECT_CLOSEOUT_TABS = [
  { label: "Checklist", id: "checklist" },
  { label: "Summary", id: "summary" },
  { label: "Lessons Learned", id: "lessons" },
] as const;

export type ProjectCloseoutTabId = (typeof PROJECT_CLOSEOUT_TABS)[number]["id"];

export function isProjectCloseoutTabId(id: string): id is ProjectCloseoutTabId {
  return PROJECT_CLOSEOUT_TABS.some((t) => t.id === id);
}

/** Immutable list replace for optimistic closeout update. */
export function replaceCloseoutInList<T extends { id?: string }>(
  list: T[] | null | undefined,
  id: string,
  patch: Partial<T>,
): T[] {
  return (list || []).map((row) => (row.id === id ? { ...row, ...patch } : row));
}

export function replaceCloseoutWithServerRow<T extends { id?: string }>(
  list: T[] | null | undefined,
  updated: T,
): T[] {
  return (list || []).map((row) => (row.id === updated.id ? updated : row));
}
