import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { toastCrudError } from "@/components/shared/crudFeedback";
import { logActivity } from "@/services/auditLogger";
import { getQueryKey, invalidateEntity } from "@/services/cacheRegistry";
import {
  toUserErrorMessage,
  withProjectId,
} from "@/lib/mutations/standardMutation";
import type { PresetDefinition } from "@/lib/budgetHourPresets";
import {
  buildBudgetHourDeletePatch,
  type BudgetHourCreate,
  type BudgetHourPatch,
  type BudgetHourRow,
  type WorkPackageRow,
} from "./budgetHoursControlCenter.derive";

interface BudgetHourUpdateVariables {
  id: string;
  patch: BudgetHourPatch;
}

interface BudgetHourDeleteVariables {
  id: string;
  scopeItem?: string | null;
}

export function useBudgetHoursData(projectId: string | null | undefined) {
  const queryClient = useQueryClient();

  const rowsQuery = useQuery<BudgetHourRow[]>({
    queryKey: getQueryKey("budget_hour_item", projectId),
    queryFn: () =>
      projectId
        ? (entities.BudgetHourItem.filter(
            { project_id: projectId },
            "sort_order",
          ) as Promise<BudgetHourRow[]>)
        : [],
    enabled: !!projectId,
  });

  const workPackagesQuery = useQuery<WorkPackageRow[]>({
    queryKey: getQueryKey("work_package", projectId),
    queryFn: () =>
      projectId
        ? (entities.WorkPackage.filter({
            project_id: projectId,
          }) as Promise<WorkPackageRow[]>)
        : [],
    enabled: !!projectId,
  });

  const rows = useMemo(
    () => (rowsQuery.data ?? []).filter((row) => !row.is_deleted),
    [rowsQuery.data],
  );

  const wpsById = useMemo(
    () =>
      new Map(
        (workPackagesQuery.data ?? []).map((workPackage) => [
          workPackage.id,
          workPackage,
        ]),
      ),
    [workPackagesQuery.data],
  );

  const create = useMutation<BudgetHourRow, Error, BudgetHourCreate>({
    mutationFn: (payload) =>
      entities.BudgetHourItem.create(
        withProjectId(payload, projectId),
      ) as Promise<BudgetHourRow>,
    onSuccess: async (created) => {
      logActivity("budget_hour_item", "created", created, { projectId });
      await invalidateEntity(queryClient, "budget_hour_item", projectId);
    },
    onError: (error) => toastCrudError(error, "Create failed"),
  });

  const update = useMutation<
    BudgetHourRow,
    Error,
    BudgetHourUpdateVariables
  >({
    mutationFn: ({ id, patch }) =>
      entities.BudgetHourItem.update(id, patch) as Promise<BudgetHourRow>,
    onSuccess: async (updated) => {
      logActivity("budget_hour_item", "updated", updated, { projectId });
      await invalidateEntity(queryClient, "budget_hour_item", projectId);
    },
    onError: (error) => toastCrudError(error, "Save failed"),
  });

  const remove = useMutation<
    BudgetHourRow,
    Error,
    BudgetHourDeleteVariables
  >({
    mutationFn: ({ id }) =>
      entities.BudgetHourItem.update(
        id,
        buildBudgetHourDeletePatch(new Date().toISOString()),
      ) as Promise<BudgetHourRow>,
    onSuccess: async (updated, deleted) => {
      logActivity(
        "budget_hour_item",
        "deleted",
        updated || {
          id: deleted.id,
          project_id: projectId,
          scope_item: deleted.scopeItem,
        },
        { projectId },
      );
      await invalidateEntity(queryClient, "budget_hour_item", projectId);
      toast.success("Row removed");
    },
    onError: (error) => toastCrudError(error, "Delete failed"),
  });

  const applyPreset = async (preset: PresetDefinition) => {
    if (!projectId) return;
    for (const row of preset.build()) {
      try {
        await entities.BudgetHourItem.create(withProjectId(row, projectId));
      } catch (error) {
        toast.error(
          `Preset row "${row.scope_item}" failed: ${toUserErrorMessage(error, "unknown")}`,
        );
      }
    }
    await queryClient.invalidateQueries({
      queryKey: getQueryKey("budget_hour_item", projectId),
    });
    toast.success(`Loaded "${preset.label}"`);
  };

  return {
    rows,
    wpsById,
    rowsQuery,
    create,
    update,
    remove,
    applyPreset,
  };
}
