import type { QueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";

export const contractEvidenceKey = (projectId: string | null | undefined, orgId: string | null | undefined) =>
  ["contract-management", projectId, "evidence", orgId] as const;

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

/** A contract total needs complete commercial sources from one proven workspace. */
export async function loadContractEvidence(projectId: string, orgId: string) {
  if (!projectId || !orgId) throw new Error("Select a workspace and project to load the contract.");
  const projects = await entities.Project.filterAll({ id: projectId, org_id: orgId }, "id");
  if (projects.length !== 1 || projects[0].id !== projectId || projects[0].org_id !== orgId || projects[0].is_deleted) {
    throw new Error("The selected project is not available in this workspace.");
  }
  const filter = { project_id: projectId };
  const [changeOrders, sovItems, expenses] = await Promise.all([
    completeSource("Change orders", projectId, () => entities.ChangeOrder.filterAll(filter, "id")),
    completeSource("SOV lines", projectId, () => entities.SOVItem.filterAll(filter, "id")),
    completeSource("Expenses", projectId, () => entities.Expense.filterAll(filter, "id")),
  ]);
  return { projectId, orgId, project: projects[0], changeOrders, sovItems, expenses };
}

export type ContractEvidence = Awaited<ReturnType<typeof loadContractEvidence>>;

export function assertContractEvidence(client: QueryClient, projectId: string, orgId: string): ContractEvidence {
  const state = client.getQueryState<ContractEvidence>(contractEvidenceKey(projectId, orgId));
  if (!state || state.status !== "success" || state.fetchStatus !== "idle" || state.isInvalidated || state.data?.projectId !== projectId || state.data.orgId !== orgId) {
    throw new Error("Contract evidence is incomplete or refreshing. Refresh it before saving.");
  }
  return state.data;
}
