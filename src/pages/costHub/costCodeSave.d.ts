interface CostCodeMutationLike {
  mutateAsync: (input: never) => Promise<unknown>;
}

export interface PersistCostCodeArgs {
  editingId?: string | null;
  data: Record<string, unknown>;
  projectId: string;
  createMutation: CostCodeMutationLike;
  updateMutation: CostCodeMutationLike;
}

export function persistCostCode(args: PersistCostCodeArgs): Promise<unknown>;
