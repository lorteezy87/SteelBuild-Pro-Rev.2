/** Pure live-project filter + name sort for ProjectContext. */

export function isLiveProject(project: { is_deleted?: boolean | null } | null | undefined): boolean {
  return Boolean(project) && project!.is_deleted !== true;
}

export function sortProjects<T extends { name?: string | null }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
