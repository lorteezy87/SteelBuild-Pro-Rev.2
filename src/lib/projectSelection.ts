/** Account/workspace-owned cache of confirmed live project rows. */
export const ACTIVE_PROJECT_ID_KEY = "activeProjectId";
export const PROJECTS_CACHE_KEY = "sbp_projects_cache";

export type ProjectCacheOwner = { userId: string; orgId: string };
export type CachedProject = { id?: unknown; org_id?: unknown; is_deleted?: unknown };
type ProjectCacheEnvelope = {
  version: 2;
  owner: ProjectCacheOwner;
  projects: CachedProject[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOwnedLiveProject(value: unknown, owner: ProjectCacheOwner): value is CachedProject {
  return isRecord(value) && typeof value.id === "string" &&
    value.org_id === owner.orgId && value.is_deleted !== true;
}

/**
 * Legacy arrays have no proven owner and must never seed authenticated UI.
 * A failed network request may retain only data from this exact account/workspace.
 */
export function readOwnedProjects(
  owner: ProjectCacheOwner | null | undefined,
): CachedProject[] {
  if (!owner) return [];
  try {
    const raw = localStorage.getItem(PROJECTS_CACHE_KEY);
    if (!raw) return [];
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || envelope.version !== 2 || !isRecord(envelope.owner) ||
      envelope.owner.userId !== owner.userId || envelope.owner.orgId !== owner.orgId ||
      !Array.isArray(envelope.projects)) return [];
    return envelope.projects.filter((project: unknown): project is CachedProject => isOwnedLiveProject(project, owner));
  } catch {
    return [];
  }
}

export function writeOwnedProjects(
  projects: readonly CachedProject[],
  owner: ProjectCacheOwner | null | undefined,
): void {
  // Without a verified scope, never read or replace another account's cache.
  if (!owner) return;
  try {
    const live = projects.filter((project) => isOwnedLiveProject(project, owner));
    if (!live.length) {
      localStorage.removeItem(PROJECTS_CACHE_KEY);
      return;
    }
    const envelope: ProjectCacheEnvelope = { version: 2, owner, projects: live };
    localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage is an optional optimization, not a prerequisite for project access.
  }
}

/** A selection is pending only when this account/workspace owns the cached row. */
export function hasResolvableProjectSelection(owner?: ProjectCacheOwner | null): boolean {
  try {
    const savedId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
    return Boolean(savedId && readOwnedProjects(owner).some((project) => project.id === savedId));
  } catch {
    return false;
  }
}
