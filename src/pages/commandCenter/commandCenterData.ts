/** Keep in sync with entityClient.filterAll's pagination safety limit. */
export const COMMAND_SOURCE_ROW_CAP = 100_000;

interface ProjectRecord { project_id?: string | null }
interface ProjectEntity<T extends ProjectRecord> {
  filterAll: (conditions: { project_id: string }, sortBy: string) => Promise<T[]>;
}

/** A truncated or incorrectly scoped source cannot support a project briefing. */
export async function loadCommandSource<T extends ProjectRecord>(
  entity: ProjectEntity<T>, projectId: string, sortBy: string,
): Promise<T[]> {
  const records = await entity.filterAll({ project_id: projectId }, sortBy);
  if (records.length >= COMMAND_SOURCE_ROW_CAP) {
    throw new Error("Source reached its pagination safety limit; completeness could not be verified.");
  }
  if (records.some((record) => record.project_id !== projectId)) {
    throw new Error("Source returned records outside the selected project.");
  }
  return records;
}
