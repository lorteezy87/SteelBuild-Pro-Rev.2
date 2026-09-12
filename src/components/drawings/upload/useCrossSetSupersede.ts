import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchCrossSetSource } from "@/lib/crossSetSupersedeRepository";
import { EMPTY_CROSS_SET_PLAN, planCrossSetSupersede } from "@/lib/crossSetSupersede";
import type {
  CrossSetPlan,
  CrossSetRow,
  SupersedeLabels,
  TitleRelation,
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

/** A user's choice for one old drawing, with the title relation its row had when it was made. */
interface StoredChoice {
  value: boolean;
  relation: TitleRelation;
}

// A choice made while the row had another title relation doesn't carry over —
// above all, a tick given to a same-title or title-missing row never follows it
// into the "different drawing" section. The row falls back to its default.
function choiceFor(row: CrossSetRow, stored: StoredChoice | undefined): boolean {
  return stored && stored.relation === row.titleRelation ? stored.value : row.defaultChecked;
}

/**
 * The Review step's "pages this upload replaces" proposal: a fresh read of the
 * project's live sheets on every visit (staleTime 0), re-planned as the user
 * edits sheet numbers, titles, selection or the set name. Defaults come from the
 * plan; once the user toggles a row that choice is kept against the old
 * drawing's id, and dropped if the row stops matching or its title relation
 * changes.
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

  const [overrides, setOverrides] = useState<ReadonlyMap<string, StoredChoice>>(() => new Map());

  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      const relationById = new Map<string, TitleRelation>();
      for (const row of plan.rows) relationById.set(row.oldId, row.titleRelation);
      const next = new Map<string, StoredChoice>();
      prev.forEach((stored, id) => {
        if (relationById.get(id) === stored.relation) next.set(id, stored);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [plan]);

  const isChecked = useCallback(
    (row: CrossSetRow) => !row.disabled && choiceFor(row, overrides.get(row.oldId)),
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
      for (const row of rows) if (!row.disabled) next.set(row.oldId, { value, relation: row.titleRelation });
      return next;
    });
  }, []);

  const toggle = useCallback(
    (id: string) => {
      const row = plan.rows.find((candidate) => candidate.oldId === id);
      if (!row || row.disabled) return;
      setOverrides((prev) => new Map(prev).set(id, { value: !choiceFor(row, prev.get(id)), relation: row.titleRelation }));
    },
    [plan],
  );

  // The group checkbox asks only about the likely replacements (the rows ticked
  // by default), so it ticks and unticks only those. A row left unticked for a
  // reason — title missing, short number, older revision, set-name case — needs
  // its own tick.
  const toggleGroup = useCallback(
    (setId: string, checked: boolean) => {
      const group = plan.groups.find((candidate) => candidate.setId === setId);
      if (group) setMany(group.rows.filter((row) => row.defaultChecked), checked);
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
