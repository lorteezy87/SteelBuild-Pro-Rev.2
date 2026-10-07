import type { QueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";

export const constraintEvidenceKey = (projectId: string | null | undefined, orgId: string | null | undefined) =>
  ["constraints", projectId, "evidence", orgId] as const;

class ConstraintEvidenceError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(label: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : "The source could not be read.";
    super(`${label}: ${detail}`, { cause });
    // Preserve non-retryable read limits/schema errors for the shared query policy.
    this.status = cause && typeof cause === "object" && "status" in cause && typeof cause.status === "number" ? cause.status : undefined;
    this.code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? cause.code : undefined;
  }
}

async function readSource<T extends { project_id?: string | null }>(
  label: string,
  projectId: string,
  read: () => Promise<T[]>,
): Promise<T[]> {
  try {
    const records = await read();
    if (records.length >= 100_000) throw Object.assign(new Error("The complete-read safety limit was reached."), { status: 400, code: "READ_LIMIT_REACHED" });
    if (records.some(record => record.project_id !== projectId)) {
      throw Object.assign(new Error("Records outside the selected project were returned."), { status: 400 });
    }
    return records;
  } catch (error) {
    throw new ConstraintEvidenceError(label, error);
  }
}

/** Publish one complete project snapshot; a missing source is never an empty register. */
export async function loadConstraintEvidence(projectId: string, orgId: string) {
  if (!projectId || !orgId) throw new Error("Select a workspace and project before loading constraint evidence.");
  const projects = await entities.Project.filterAll({ id: projectId, org_id: orgId }, "id");
  if (projects.length !== 1 || projects[0].id !== projectId || projects[0].org_id !== orgId || projects[0].is_deleted) {
    throw new Error("The selected project is not available in this workspace.");
  }
  const filter = { project_id: projectId };
  const [items, workPackages, rfis, submittals, deliveries, scheduleTasks, drawings, inspections] = await Promise.all([
    readSource("Manual constraints", projectId, () => entities.ActionItem.filterAll({ ...filter, category: "CONSTRAINT" }, "id")),
    readSource("Work packages", projectId, () => entities.WorkPackage.filterAll(filter, "id")),
    readSource("RFIs", projectId, () => entities.RFI.filterAll(filter, "id")),
    readSource("Submittals", projectId, () => entities.Submittal.filterAll(filter, "id")),
    readSource("Deliveries", projectId, () => entities.Delivery.filterAll(filter, "id")),
    readSource("Schedule tasks", projectId, () => entities.ScheduleTask.filterAll(filter, "id")),
    readSource("Drawings", projectId, () => entities.Drawing.filterAll(filter, "id")),
    readSource("Inspections", projectId, () => entities.Inspection.filterAll(filter, "id")),
  ]);
  return { projectId, orgId, project: projects[0], items, workPackages, rfis, submittals, deliveries, scheduleTasks, drawings, inspections };
}

export type ConstraintEvidence = Awaited<ReturnType<typeof loadConstraintEvidence>>;

/** Read the cache at the write boundary, including invalidation before React repaints. */
export function assertConstraintEvidence(client: QueryClient, projectId: string, orgId: string): ConstraintEvidence {
  const state = client.getQueryState<ConstraintEvidence>(constraintEvidenceKey(projectId, orgId));
  if (!state || state.status !== "success" || state.fetchStatus !== "idle" || state.isInvalidated || state.data?.projectId !== projectId || state.data.orgId !== orgId) {
    throw new Error("Constraint evidence is incomplete or refreshing. Retry the evidence before saving.");
  }
  return state.data;
}
