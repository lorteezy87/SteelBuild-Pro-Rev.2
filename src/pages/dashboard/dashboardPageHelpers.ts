/** Pure project-scoping helpers shared by Dashboard (and similar shells). */

export type ProjectLike = {
  id?: string | null;
  on_hold?: boolean | null;
  [key: string]: unknown;
};

export type RowWithProject = {
  project_id?: string | null;
  [key: string]: unknown;
};

export function filterPortfolioProjects<T extends ProjectLike>(projects: T[]): T[] {
  return (projects || []).filter((p) => !p.on_hold);
}

export function buildLiveProjectIdSet(
  projects: Array<{ id?: string | null }>,
): Set<string> {
  return new Set((projects || []).map((p) => p.id).filter(Boolean) as string[]);
}

/** When a project is active, pass through; else keep only live-project children. */
export function scopePortfolioRows<T extends RowWithProject>(
  rows: T[],
  opts: { projectId?: string | null; liveProjectIds: Set<string> },
): T[] {
  if (opts.projectId) return rows || [];
  return (rows || []).filter(
    (row) => row?.project_id && opts.liveProjectIds.has(row.project_id),
  );
}

export function filterRowsByProjectId<T extends RowWithProject>(
  rows: T[],
  projectId: string | null | undefined,
): T[] {
  if (!projectId) return [];
  return (rows || []).filter((r) => r.project_id === projectId);
}

/** Scope entity rows to projects still present in the live id set. */
export function filterRowsByLiveProjectIds<T extends RowWithProject>(
  rows: T[],
  liveProjectIds: Set<string>,
): T[] {
  return (rows || []).filter(
    (row) => row?.project_id && liveProjectIds.has(row.project_id),
  );
}
