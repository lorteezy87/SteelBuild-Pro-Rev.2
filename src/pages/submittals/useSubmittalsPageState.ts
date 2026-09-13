import { useCallback, useMemo, useRef, useState } from "react";
import { buildStatusSuggestPatch, filterSuggestAgainstCurrent } from "@/lib/submittalLinkGlue";
import type { StatusSuggestPatch } from "@/lib/submittalLinkGlue";
import { localToday } from "@/utils/dates";
import {
  computeSubmittalStats,
  filterAndSortSubmittals,
  getVisibleSelectionState,
} from "./submittalRegister.derive";
import type { ReleaseBlock } from "./useSubmittalsPageMutations";
import type { DrawingSetsById, Submittal, SubmittalRoundRecord } from "./types";

export interface CreateFromSetState {
  drawing_set_ids: string[];
  status?: string;
  ball_in_court?: string;
  requireLinkedSet: boolean;
}

export interface PendingStatusSuggest {
  id: string;
  before: Submittal;
  nextStatus: string;
}

export function useSubmittalsPageState(
  rows: Submittal[],
  drawingSetsById: DrawingSetsById,
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createFromSet, setCreateFromSet] = useState<CreateFromSetState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [spinOffParentId, setSpinOffParentId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBIC, setFilterBIC] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showNewRound, setShowNewRound] = useState(false);
  const [releaseBlock, setReleaseBlock] = useState<ReleaseBlock | null>(null);
  const [showSheetResponse, setShowSheetResponse] = useState<SubmittalRoundRecord | null>(null);
  const [statusSuggest, setStatusSuggest] = useState<{
    submittalId: string;
    patch: StatusSuggestPatch;
  } | null>(null);
  const pendingSuggestRef = useRef<PendingStatusSuggest | null>(null);

  const filtered = useMemo(
    () => filterAndSortSubmittals(
      rows,
      { filterStatus, filterBIC, search },
      drawingSetsById,
    ),
    [rows, filterStatus, filterBIC, search, drawingSetsById],
  );
  const stats = useMemo(() => computeSubmittalStats(rows, localToday()), [rows]);
  const { allSelected } = getVisibleSelectionState(filtered, selectedIds);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((previous) => {
      if (
        filtered.length > 0
        && filtered.every((submittal) => previous.has(submittal.id as string))
      ) {
        return new Set();
      }
      const next = new Set(previous);
      filtered.forEach((submittal) => next.add(submittal.id as string));
      return next;
    });
  }, [filtered]);

  const settleStatusSuggest = useCallback((updatedRow: unknown) => {
    const pending = pendingSuggestRef.current;
    pendingSuggestRef.current = null;
    if (!pending) return;
    const suggestion = buildStatusSuggestPatch(pending.before, pending.nextStatus, {
      today: localToday(),
    });
    const remaining = filterSuggestAgainstCurrent(
      suggestion,
      (updatedRow || pending.before) as Submittal,
    );
    if (remaining) {
      setStatusSuggest({ submittalId: pending.id, patch: remaining });
      setSelectedId(pending.id);
    }
  }, []);

  return {
    selectedId,
    setSelectedId,
    showCreate,
    setShowCreate,
    createFromSet,
    setCreateFromSet,
    editingId,
    setEditingId,
    spinOffParentId,
    setSpinOffParentId,
    toDelete,
    setToDelete,
    filterStatus,
    setFilterStatus,
    filterBIC,
    setFilterBIC,
    search,
    setSearch,
    selectedIds,
    setSelectedIds,
    showBulkEdit,
    setShowBulkEdit,
    showBulkAdd,
    setShowBulkAdd,
    showBulkDelete,
    setShowBulkDelete,
    showNewRound,
    setShowNewRound,
    releaseBlock,
    setReleaseBlock,
    showSheetResponse,
    setShowSheetResponse,
    statusSuggest,
    setStatusSuggest,
    pendingSuggestRef,
    filtered,
    stats,
    allSelected,
    toggleSelect,
    toggleAll,
    settleStatusSuggest,
  };
}
