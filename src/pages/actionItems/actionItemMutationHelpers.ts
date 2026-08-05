/**
 * Pure helpers for Action Item create / assign payloads.
 * Keep React Query / toast / entities out of this module.
 */

import { withProjectId } from "@/lib/mutations/standardMutation";

/** Stamp active project on an Action Item create payload. */
export function buildActionItemCreatePayload(
  data: Record<string, unknown>,
  projectId: string | null | undefined,
): Record<string, unknown> & { project_id: string } {
  return withProjectId(data, projectId);
}

/**
 * Build the patch for a single-item or bulk assign.
 * Empty / whitespace assignees clear the assignment (null).
 */
export function buildActionItemAssignPatch(
  assignee: string | null | undefined,
): { assigned_to: string | null } {
  if (assignee == null) return { assigned_to: null };
  const trimmed = String(assignee).trim();
  return { assigned_to: trimmed === "" ? null : trimmed };
}

/** Shape used by heterogeneous bulk updates (e.g. bump due dates). */
export function buildActionItemBulkAssignUpdates(
  ids: string[],
  assignee: string | null | undefined,
): Array<{ id: string; data: { assigned_to: string | null } }> {
  const data = buildActionItemAssignPatch(assignee);
  return ids.map((id) => ({ id, data }));
}
