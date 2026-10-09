interface EvidenceQuery {
  status: "pending" | "error" | "success";
  fetchStatus: "idle" | "fetching" | "paused";
}

export interface WorkPackageEvidenceSource {
  label: string;
  query: EvidenceQuery;
}

/** Disabled sources are omitted by the page, never treated as successful reads. */
export function workPackageEvidenceState(sources: readonly WorkPackageEvidenceSource[]) {
  const failed = sources.filter(source => source.query.status === "error").map(source => source.label);
  const pending = sources.filter(source => source.query.status === "pending").map(source => source.label);
  const refreshing = sources.some(source => source.query.fetchStatus !== "idle");
  return { failed, pending, refreshing, complete: failed.length === 0 && pending.length === 0 };
}

export function rejectIncompleteWorkPackageEvidence(): never {
  throw new Error("Work package evidence reached its pagination safety limit. Completeness could not be verified.");
}

interface ProjectRecord { project_id?: string | null }
interface ProjectEntity<T extends ProjectRecord> {
  filterAll: (filter: { project_id: string }, sortBy: string) => Promise<T[]>;
}

/** Keep complete evidence separate from capped register caches. */
export async function loadWorkPackageEvidence<T extends ProjectRecord>(entity: ProjectEntity<T>, projectId: string): Promise<T[]> {
  const records = await entity.filterAll({ project_id: projectId }, "id");
  return verifyWorkPackageEvidenceScope(records, projectId);
}

/** Also validate the result of direct paged reads before publishing a snapshot. */
export function verifyWorkPackageEvidenceScope<T extends ProjectRecord>(records: T[], projectId: string): T[] {
  if (records.length >= 100_000) rejectIncompleteWorkPackageEvidence();
  if (records.some(record => record.project_id !== projectId)) {
    throw new Error("Work package evidence returned records outside the selected project.");
  }
  return records;
}
