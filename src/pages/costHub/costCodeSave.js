/**
 * Persist a cost code and let failures propagate to CostCodeFormModal.
 * The modal awaits its onSave callback, so callers must use mutateAsync rather
 * than fire-and-forget mutate; otherwise the dialog closes before Supabase has
 * accepted the write and the user's values are lost on failure.
 */
export async function persistCostCode({
  editingId,
  data,
  projectId,
  createMutation,
  updateMutation,
}) {
  if (editingId) {
    return updateMutation.mutateAsync({ id: editingId, ...data });
  }

  return createMutation.mutateAsync({ ...data, project_id: projectId });
}
