/**
 * Persist a cost code and let failures propagate to CostCodeFormModal.
 * The modal awaits its onSave callback, so callers must use mutateAsync rather
 * than fire-and-forget mutate; otherwise the dialog closes before Supabase has
 * accepted the write and the user's values are lost on failure.
 */
import { assertProjectId } from "@/lib/mutations/standardMutation";

type Mutator = {
  mutateAsync: (payload: Record<string, unknown>) => Promise<unknown>;
};

export async function persistCostCode({
  editingId,
  data,
  projectId,
  createMutation,
  updateMutation,
}: {
  editingId: string | null;
  data: Record<string, unknown>;
  projectId: string | null | undefined;
  createMutation: Mutator;
  updateMutation: Mutator;
}) {
  assertProjectId(projectId);

  if (editingId) {
    return updateMutation.mutateAsync({ id: editingId, ...data });
  }

  return createMutation.mutateAsync({ ...data, project_id: projectId });
}
