type AsyncMutation = {
  mutateAsync: (input: Record<string, unknown>) => Promise<unknown>;
};

interface PersistCostCodeArgs {
  editingId: string | null;
  data: Record<string, unknown>;
  projectId: string;
  createMutation: AsyncMutation;
  updateMutation: AsyncMutation;
}

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
}: PersistCostCodeArgs): Promise<unknown> {
  if (editingId) {
    return updateMutation.mutateAsync({ id: editingId, ...data });
  }

  return createMutation.mutateAsync({ ...data, project_id: projectId });
}
