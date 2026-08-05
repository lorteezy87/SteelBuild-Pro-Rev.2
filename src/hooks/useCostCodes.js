/**
 * useCostCodes — project-scoped cost-code list + CRUD.
 *
 * Owns the data layer for cost codes: the sorted read plus create / update /
 * delete / bulk mutations, with cache wiring via the shared crudFeedback
 * helpers. UI side-effects (closing modals, clearing selection) stay in the
 * caller — pass them as the per-call onSuccess on each .mutate() so this hook
 * stays UI-agnostic and reusable.
 *
 * Extracted from Financials.jsx as part of moving the data layer behind hooks
 * (Supabase access stays only inside the hook).
 *
 * @param {string|null|undefined} projectId
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  toastCrudError,
} from "@/components/shared/crudFeedback";
// Invalidate through the central registry so ALL cost-code surfaces refresh
// together (Budget Control, Cost Dashboard, Cost Control Center, Expenses).
// Previously this hook only invalidated its own ["cost-codes", pid] keys, so
// edits here left the other surfaces (and their divergent keys) stale.
import { invalidateEntity } from "@/services/cacheRegistry";

/**
 * Sort cost codes by their number using natural/numeric ordering
 * (so "2" sorts before "10"). Pure — exported for testing.
 */
export const sortCostCodes = (rows) =>
  [...rows].sort((a, b) =>
    (a.cost_code_number || "").localeCompare(b.cost_code_number || "", undefined, { numeric: true })
  );

export function useCostCodes(projectId) {
  const qc = useQueryClient();
  // Mirror Financials' key shape: the project-scoped list + the global list.
  const queryKeys = [["cost-codes", projectId], ["cost-codes"]];

  const { data: costCodes = [], isLoading } = useQuery({
    queryKey: ["cost-codes", projectId],
    queryFn: () =>
      projectId
        ? entities.CostCode.filter({ project_id: projectId }, "cost_code_number")
        : [],
    select: sortCostCodes,
    enabled: !!projectId,
  });

  const createCostCode = useMutation({
    mutationFn: (data) => entities.CostCode.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, queryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateEntity(qc, "cost_code", projectId);
    },
    onError: (error) => toastCrudError(error, "Failed to create cost code"),
  });

  const updateCostCode = useMutation({
    mutationFn: ({ id, data }) => entities.CostCode.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, queryKeys, updated);
      await invalidateEntity(qc, "cost_code", projectId);
    },
    onError: (error) => toastCrudError(error, "Failed to update cost code"),
  });

  const deleteCostCode = useMutation({
    mutationFn: (id) => entities.CostCode.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, queryKeys, deletedId);
      await invalidateEntity(qc, "cost_code", projectId);
    },
    onError: (error) => toastCrudError(error, "Failed to delete cost code"),
  });

  const bulkDeleteCostCodes = useMutation({
    // One chunked .in('id', ids) delete — throws on failure (no silent swallow).
    mutationFn: (ids) => entities.CostCode.bulkDelete(ids),
    onSuccess: async (_result, ids) => {
      const list = Array.isArray(ids) ? ids : [];
      for (const id of list) removeRecordFromCaches(qc, queryKeys, id);
      await invalidateEntity(qc, "cost_code", projectId);
      toast.success(`Deleted ${list.length} cost code${list.length === 1 ? "" : "s"}`);
    },
    onError: (error) => toastCrudError(error, "Bulk delete failed"),
  });

  const bulkUpdateCostCodes = useMutation({
    // Identical `data` patch across all ids → one chunked .in('id', ids) update.
    mutationFn: ({ ids, data }) => entities.CostCode.bulkUpdate(ids, data),
    onSuccess: async (_result, vars) => {
      await invalidateEntity(qc, "cost_code", projectId);
      const n = Array.isArray(vars?.ids) ? vars.ids.length : 0;
      toast.success(`Updated ${n} cost code${n === 1 ? "" : "s"}`);
    },
    onError: (error) => toastCrudError(error, "Bulk update failed"),
  });

  return {
    costCodes,
    isLoading,
    createCostCode,
    updateCostCode,
    deleteCostCode,
    bulkDeleteCostCodes,
    bulkUpdateCostCodes,
  };
}
