import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCrossSetSource } from "@/lib/crossSetSupersedeRepository";
import { EMPTY_CROSS_SET_PLAN, planCrossSetSupersede } from "@/lib/crossSetSupersede";
import type {
  CrossSetPlan,
  CrossSetRow,
  SupersedeLabels,
  UploadMetaLike,
  UploadSheetLike,
} from "@/lib/crossSetSupersede";

export type CrossSetStatus = "idle" | "loading" | "error" | "ready";

/**
 * Lives under ['drawings', pid] so the registry's "drawing" family invalidates
 * it by prefix. Nothing reads ['drawings', pid] with a prefix getQueriesData, so
 * the different data shape under that prefix is safe.
 */
export const crossSetSourceQueryKey = (projectId: string | null | undefined) =>
  ["drawings", projectId, "cross-set-source"] as const;

export interface UseCrossSetSupersedeArgs {
  projectId: string | null | undefined;
  sheets: readonly UploadSheetLike[];
  meta: UploadMetaLike | null | undefined;
}

export interface UseCrossSetSupersedeResult {
  status: CrossSetStatus;
  plan: CrossSetPlan;
  checkedIds: string[];
  labels: SupersedeLabels;
  isChecked: (row: CrossSetRow) => boolean;
  toggle: (id: string) => void;
  toggleGroup: (setId: string, checked: boolean) => void;
  selectAll: () => void;
  clear: () => void;
  retry: () => void;
}

/**
 * The Review step's "pages this upload replaces" proposal: a fresh read of the
 * project's live sheets on every visit (staleTime 0), re-planned as the user
 * edits sheet numbers, titles, selection or the set name. Defaults come from the
 * plan; once the user toggles a row that choice is kept against the old
 * drawing's id, and dropped if the row stops matching.
 */
export function useCrossSetSupersede({ projectId, sheets, meta }: UseCrossSetSupersedeArgs): UseCrossSetSupersedeResult {
  const query = useQuery({
    queryKey: crossSetSourceQueryKey(projectId),
    queryFn: () => fetchCrossSetSource(projectId as string),
    enabled: !!projectId,
    staleTime: 0,
    retry: false,
  });

  const setName = meta?.setName ?? "";
  const revision = meta?.revision ?? "";
  const plan = useMemo<CrossSetPlan>(
    () => (query.data ? planCrossSetSupersede({ source: query.data, newSheets: sheets, meta: { setName, revision } }) : EMPTY_CROSS_SET_PLAN),
    [query.data, sheets, setName, revision],
  );

  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());

  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(plan.rows.map((row) => row.oldId));
      const next = new Map<string, boolean>();
      prev.forEach((value, id) => {
        if (live.has(id)) next.set(id, value);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [plan]);

  const isChecked = useCallback(
    (row: CrossSetRow) => {
      if (row.disabled) return false;
      const stored = overrides.get(row.oldId);
      return stored === undefined ? row.defaultChecked : stored;
    },
    [overrides],
  );

  const checkedIds = useMemo(() => plan.rows.filter(isChecked).map((row) => row.oldId), [plan, isChecked]);

  const labels = useMemo<SupersedeLabels>(
    () => Object.fromEntries(plan.rows.map((row) => [row.oldId, { sheetNumber: row.oldSheetNumber, setName: row.oldSetName }])),
    [plan],
  );

  const setMany = useCallback((rows: readonly CrossSetRow[], value: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const row of rows) if (!row.disabled) next.set(row.oldId, value);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const row = plan.rows.find((candidate) => candidate.oldId === id);
      if (!row || row.disabled) return;
      setOverrides((prev) => {
        const stored = prev.get(id);
        const current = stored === undefined ? row.defaultChecked : stored;
        return new Map(prev).set(id, !current);
      });
    },
    [plan],
  );

  const toggleGroup = useCallback(
    (setId: string, checked: boolean) => {
      const group = plan.groups.find((candidate) => candidate.setId === setId);
      if (group) setMany(group.rows, checked);
    },
    [plan, setMany],
  );

  // "Select all" never ticks the same-number-different-drawing rows; "Clear" clears everything.
  const selectAll = useCallback(() => setMany(plan.groups.flatMap((group) => group.rows), true), [plan, setMany]);
  const clear = useCallback(() => setMany(plan.rows, false), [plan, setMany]);

  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // A failed read — including a failed background refetch — fails closed: no pages are superseded.
  const status: CrossSetStatus = !projectId ? "idle" : query.isError ? "error" : query.data ? "ready" : "loading";

  return { status, plan, checkedIds, labels, isChecked, toggle, toggleGroup, selectAll, clear, retry };
}
