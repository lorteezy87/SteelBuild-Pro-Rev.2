/** Workspace-scoped portfolio reads. RLS alone can include several memberships. */
type WorkspaceProject = {
  id: string;
  org_id?: string | null;
  on_hold?: boolean | null;
  is_deleted?: boolean | null;
};

type ProjectRow = { project_id?: string | null };
type ProjectReader<T extends ProjectRow> = {
  filterAll: (conditions: Record<string, unknown>, sortBy?: string) => Promise<T[]>;
};

export function projectsInWorkspace<T extends WorkspaceProject>(
  projects: readonly T[],
  orgId: string | null | undefined,
): T[] {
  if (!orgId) return [];
  return projects.filter((project) =>
    project.org_id === orgId && !project.on_hold && !project.is_deleted,
  );
}

/**
 * Read every matching row without a membership-wide fallback. Small ID batches
 * keep PostgREST URLs bounded; filterAll retains pagination within each batch.
 * Errors propagate so financial surfaces never render a partial batch as truth.
 */
export async function readProjectRows<T extends ProjectRow>(
  entity: ProjectReader<T>,
  projectIds: readonly string[],
  sortBy?: string,
): Promise<T[]> {
  const ids = [...new Set(projectIds.filter((id) => id.length > 0))];
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const allowed = new Set(batch);
    const result = await entity.filterAll({ project_id: batch }, sortBy);
    // entityClient.filterAll stops at 100,000 rows with a warning. An exact
    // ceiling-sized result cannot prove completeness, so never publish totals.
    if (result.length >= 100_000) {
      throw new Error("Portfolio data reached the 100,000-row safety limit. Narrow the project scope before using these totals.");
    }
    rows.push(...result.filter((row) => row.project_id && allowed.has(row.project_id)));
  }
  return rows;
}
