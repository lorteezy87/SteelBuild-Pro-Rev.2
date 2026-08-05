/** Pure constants for Command Center page shell. */

/** Default TanStack Query staleTime for command center overview queries. */
export const COMMAND_CENTER_STALE_TIME_MS = 60_000;

/** Shared empty list sentinel (frozen) for query initialData. */
export const COMMAND_CENTER_EMPTY_LIST: readonly never[] = Object.freeze([]);
