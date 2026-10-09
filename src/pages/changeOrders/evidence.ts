import { entities } from '@/api/supabaseClient';
import type { QueryClient } from '@tanstack/react-query';

export const changeOrderEvidenceKey = (projectId: string, orgId: string) =>
  ['change-orders', projectId, orgId, 'evidence'] as const;

async function source<T extends { project_id?: string | null }>(name: string, projectId: string, read: () => Promise<T[]>) {
  try {
    const rows = await read();
    if (rows.some(row => row.project_id !== projectId)) throw new Error('Records outside the selected project were returned.');
    return rows;
  } catch (cause) {
    const error = new Error(`${name}: ${cause instanceof Error ? cause.message : 'Could not load the complete register.'}`, { cause });
    if (cause && typeof cause === 'object') {
      for (const key of ['status', 'code']) if (key in cause) Object.assign(error, { [key]: Reflect.get(cause, key) });
    }
    throw error;
  }
}

/** Financial totals and approval choices share one complete, workspace-proven snapshot. */
export async function loadChangeOrderEvidence(projectId: string, orgId: string) {
  if (!projectId || !orgId) throw new Error('Select a workspace and project.');
  const project = await entities.Project.get(projectId);
  if (!project || project.org_id !== orgId || project.is_deleted) throw new Error('This project is outside the active workspace or is no longer available.');
  const filter = { project_id: projectId };
  const [cos, sovItems, rfis] = await Promise.all([
    source('Change orders', projectId, () => entities.ChangeOrder.filterAll(filter, '-created_at')),
    source('Schedule of values', projectId, () => entities.SOVItem.filterAll(filter, 'line_item_number')),
    source('RFIs', projectId, () => entities.RFI.filterAll(filter, '-created_at')),
  ]);
  return { projectId, orgId, project, cos, sovItems, rfis };
}

export type ChangeOrderEvidence = Awaited<ReturnType<typeof loadChangeOrderEvidence>>;

export function assertChangeOrderEvidence(client: QueryClient, projectId: string, orgId: string) {
  const state = client.getQueryState<ChangeOrderEvidence>(changeOrderEvidenceKey(projectId, orgId));
  if (!state || state.status !== 'success' || state.fetchStatus !== 'idle' || state.isInvalidated ||
    state.data?.projectId !== projectId || state.data.orgId !== orgId) {
    throw new Error('Commercial records are incomplete or refreshing. Retry before saving.');
  }
  return state.data;
}
