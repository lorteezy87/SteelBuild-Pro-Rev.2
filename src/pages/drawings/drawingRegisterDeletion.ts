import { entities } from '@/api/supabaseClient';

/** Soft deletion only. update() requires a returned row, so RLS-denied or
 * missing rows fail instead of looking like a successful zero-row delete.
 * The database remains authoritative for project membership and set locks.
 */
export async function deleteRegisterSheet(
  drawing: { id: string; project_id?: string | null } | null | undefined,
  projectId: string | null | undefined,
) {
  if (!projectId || !drawing?.id || drawing.project_id !== projectId) {
    throw new Error('Sheet does not belong to the active project. Refresh the register and try again.');
  }
  return entities.Drawing.update(drawing.id, {
    is_deleted: true,
    deleted_at: new Date().toISOString(),
  });
}
