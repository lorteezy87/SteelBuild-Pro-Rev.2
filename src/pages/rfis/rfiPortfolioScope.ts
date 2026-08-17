export function scopeRfiPortfolioRows<T extends { project_id?: string | null }>(
  projects: Array<{ id?: string | null }>,
  rows: T[],
): T[] {
  const visibleIds = new Set(projects.map((project) => project.id).filter(Boolean));
  return rows.filter(
    (row) => Boolean(row.project_id) && visibleIds.has(row.project_id),
  );
}
