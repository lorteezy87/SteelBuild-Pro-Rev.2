import type { QueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";

export const sovEvidenceKey = (projectId: string | null | undefined, orgId: string | null | undefined) =>
  ["sov-items", projectId, "evidence", orgId] as const;

async function completeSource<T extends { project_id?: string | null }>(label: string, projectId: string, read: () => Promise<T[]>): Promise<T[]> {
  try {
    const rows = await read();
    if (rows.length >= 100_000) throw new Error("The complete-read safety limit was reached.");
    if (rows.some(row => row.project_id !== projectId)) throw new Error("Records outside the selected project were returned.");
    return rows;
  } catch (cause) {
    throw new Error(`${label}: ${cause instanceof Error ? cause.message : "The source could not be read."}`, { cause });
  }
}

/** Financial totals are published only with a complete, workspace-owned snapshot. */
export async function loadSovEvidence(projectId: string, orgId: string) {
  if (!projectId || !orgId) throw new Error("Select a workspace and project to load the schedule of values.");
  const projects = await entities.Project.filterAll({ id: projectId, org_id: orgId }, "id");
  if (projects.length !== 1 || projects[0].id !== projectId || projects[0].org_id !== orgId || projects[0].is_deleted) {
    throw new Error("The selected project is not available in this workspace.");
  }
  const filter = { project_id: projectId };
  const [lines, costCodes] = await Promise.all([
    completeSource("SOV lines", projectId, () => entities.SOVItem.filterAll(filter, "id")),
    completeSource("Cost codes", projectId, () => entities.CostCode.filterAll(filter, "id")),
  ]);
  return { projectId, orgId, project: projects[0], lines, costCodes };
}

export type SovEvidence = Awaited<ReturnType<typeof loadSovEvidence>>;

export function assertSovEvidence(client: QueryClient, projectId: string, orgId: string): SovEvidence {
  const state = client.getQueryState<SovEvidence>(sovEvidenceKey(projectId, orgId));
  if (!state || state.status !== "success" || state.fetchStatus !== "idle" || state.isInvalidated || state.data?.projectId !== projectId || state.data.orgId !== orgId) {
    throw new Error("SOV evidence is incomplete or refreshing. Retry the evidence before saving.");
  }
  return state.data;
}
