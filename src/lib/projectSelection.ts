/**
 * The two localStorage keys that carry a user's project selection between
 * loads, and the one question the boot path needs to ask about them.
 *
 * They live here rather than in ProjectContext because IndexRoute has to answer
 * "will a project resolve this load?" BEFORE ProjectContext has fetched
 * anything — and because IndexRoute's test mocks ProjectContext wholesale, so a
 * helper exported from there would be mocked away rather than exercised.
 */

/** Most-recent explicit project pick. Written by ProjectContext.selectProject. */
export const ACTIVE_PROJECT_ID_KEY = "activeProjectId";

/**
 * Cache of the last confirmed-live project list. ProjectContext REMOVES this
 * key when a successful load returns zero live projects, so its absence is
 * informative: it means the last thing the server told us was "no projects",
 * not merely "we have not looked yet".
 */
export const PROJECTS_CACHE_KEY = "sbp_projects_cache";

type CachedProject = { id?: unknown; is_deleted?: unknown };

/** Live (non-archived) only — never seed a selection from a tombstone. */
function isLive(project: CachedProject | null | undefined): boolean {
  return Boolean(project) && project?.is_deleted !== true;
}

/**
 * Does the saved project pick still refer to a project we last saw live?
 *
 * `activeProjectId` outlives the project it names: ProjectContext only clears a
 * stale id AFTER a fetch resolves, and an empty list is retried three times
 * with 1.5s + 3s of backoff first. Anything that treats the bare presence of
 * the key as "a project is pending" therefore makes a zero-project user wait
 * out that backoff on a spinner — the exact stall IndexRoute's landing logic
 * was written to avoid. Cross-checking the cache answers the real question.
 *
 * Returns false on any storage or parse failure: the caller's fallback is to
 * decide immediately, which is the better failure mode of the two.
 */
export function hasResolvableProjectSelection(): boolean {
  try {
    const savedId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
    if (!savedId) return false;

    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return false; // last load returned no live projects

    const cached: unknown = JSON.parse(raw);
    if (!Array.isArray(cached)) return false;

    return cached.some((p: CachedProject) => isLive(p) && p?.id === savedId);
  } catch {
    return false;
  }
}
