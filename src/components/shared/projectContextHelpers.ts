/** Pure live-project filter + name sort for ProjectContext. */

export function isLiveProject(project: { is_deleted?: boolean | null } | null | undefined): boolean {
  return Boolean(project) && project!.is_deleted !== true;
}

export function sortProjects<T extends { name?: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

export const PROJECTS_CACHE_KEY = "sbp_projects_cache";

export function readProjectsCache(): any[] {
  try {
    const raw =
      typeof localStorage !== "undefined"
        ? localStorage.getItem(PROJECTS_CACHE_KEY)
        : null;
    const list = raw ? JSON.parse(raw) : [];
    return sortProjects(list.filter(isLiveProject));
  } catch {
    return [];
  }
}

export function writeProjectsCache(projects: any[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    const live = projects.filter(isLiveProject);
    if (live.length > 0) {
      localStorage.setItem(PROJECTS_CACHE_KEY, JSON.stringify(live));
    } else {
      localStorage.removeItem(PROJECTS_CACHE_KEY);
    }
  } catch {
    /* ignore cache writes */
  }
}

