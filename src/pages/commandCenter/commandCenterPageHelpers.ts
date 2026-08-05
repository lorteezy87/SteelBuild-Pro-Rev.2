/** Pure constants for Command Center page shell. */

/** Default TanStack Query staleTime for command center overview queries. */
export const COMMAND_CENTER_STALE_TIME_MS = 60_000;

/** Shared empty list sentinel (frozen) for query initialData. */
export const COMMAND_CENTER_EMPTY_LIST: readonly never[] = Object.freeze([] as never[]);

export type CommandCenterProjectRef = {
  project_number?: string | null;
  name?: string | null;
  gc_name?: string | null;
};

/** Compact id → { project_number, name, gc_name } lookup for the cockpit. */
export function buildCommandCenterProjectMap<
  T extends {
    id?: string | null;
    project_number?: string | null;
    name?: string | null;
    gc_name?: string | null;
  },
>(projects: T[] | null | undefined): Record<string, CommandCenterProjectRef> {
  const m: Record<string, CommandCenterProjectRef> = {};
  for (const p of projects || []) {
    if (!p?.id) continue;
    m[p.id] = {
      project_number: p.project_number,
      name: p.name,
      gc_name: p.gc_name,
    };
  }
  return m;
}
