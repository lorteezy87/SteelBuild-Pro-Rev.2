/**
 * Pure planning / payload helpers for Drawings.jsx handlers.
 * Keep React Query / toast / entities / setState out of this module.
 * Coordinates with drawingMutationHelpers for toast/error copy on writes.
 */

export type DrawingLike = {
  id: string;
  sheet_number?: string | null;
  stage?: string | null;
  drawing_set_id?: string | null;
  drawing_set_name?: string | null;
  project_id?: string | null;
  file_url?: string | null;
  notes?: string | null;
  revision_number?: string | null;
  [key: string]: unknown;
};

export type DrawingSetGroupLike = {
  name?: string | null;
  isUngrouped?: boolean;
  setId?: string | null;
  parent?: {
    id?: string | null;
    file_url?: string | null;
    titleblock_title_rect?: unknown;
    titleblock_number_rect?: unknown;
    [key: string]: unknown;
  } | null;
  sheets?: DrawingLike[];
  [key: string]: unknown;
};

export type SubmittalsBySetId = Record<
  string,
  { total?: number; latestStatus?: string | null; [key: string]: unknown }
>;

export type StageMutationDecision = {
  allowed: boolean;
  kind?: string;
  reason?: string;
  [key: string]: unknown;
};

export type ConfirmDialogPlan = {
  title: string;
  description: string;
};

/** Resolve parent drawing_set id from a table/grid group shape. */
export function resolveGroupSetId(group: DrawingSetGroupLike | null | undefined): string | null {
  if (!group) return null;
  const setIdCandidates = (group.sheets || []).map((s) => s.drawing_set_id).filter(Boolean);
  return (setIdCandidates[0] as string | undefined) || group.setId || group.parent?.id || null;
}

/** Confirm-dialog copy for a single sheet soft-delete. */
export function buildDeleteSheetConfirm(
  drawing: DrawingLike | null | undefined,
): ConfirmDialogPlan {
  const label = drawing?.sheet_number ? `"${drawing.sheet_number}"` : "this sheet";
  return {
    title: `Delete ${label}?`,
    description:
      "The sheet will be removed from the project. You can undo this from the toast that appears after deletion.",
  };
}

/**
 * Confirm-dialog + mutate args for cascade/set delete.
 * Returns null for ungrouped rows (no-op, matches page guard).
 */
export function buildDeleteSetConfirm(
  group: DrawingSetGroupLike,
): (ConfirmDialogPlan & {
  mutateArgs: { setId: string | null; sheetIds: string[]; setName: string };
}) | null {
  if (group.isUngrouped) return null;
  const sheets = group.sheets || [];
  const total = sheets.length;
  const setId = resolveGroupSetId(group);
  const sheetIds = sheets.map((s) => s.id);
  const description =
    total > 0
      ? `The set and all ${total} sheet${total === 1 ? "" : "s"} inside it will be removed. You can undo this from the toast that appears after deletion.`
      : "This drawing set will be removed. You can undo this from the toast that appears after deletion.";
  return {
    title: `Delete drawing set "${group.name}"?`,
    description,
    mutateArgs: { setId, sheetIds, setName: group.name || "" },
  };
}

export type AdvanceStagePlan =
  | { kind: "error"; message: string }
  | { kind: "info"; message: string }
  | {
      kind: "dialog";
      target: {
        drawingId: string;
        setId: string | null;
        currentStage: string;
        targetStage: string;
        allowLegacy: boolean;
      };
    };

/**
 * Plan a single-sheet stage advance before opening AdvanceStageDialog.
 * `validate` and `classify` are injected so this module stays free of
 * drawingsConfig / drawingsUtils imports (keeps pages/drawings focused).
 */
export function planAdvanceStage(
  drawing: DrawingLike,
  stageOrder: readonly string[],
  submittalsBySetId: SubmittalsBySetId,
  validate: (from: string | null | undefined, to: string) => { ok: boolean; reason?: string },
  classify: (
    drawing: DrawingLike,
    targetStage: string,
    submittalsBySetId: SubmittalsBySetId,
  ) => StageMutationDecision,
): AdvanceStagePlan {
  const idx = stageOrder.indexOf(drawing.stage as string);
  if (idx < 0) {
    return {
      kind: "error",
      message: `Cannot advance sheet: unknown current stage "${drawing.stage || "∅"}"`,
    };
  }
  if (idx >= stageOrder.length - 1) {
    return { kind: "info", message: "Already at final stage (IFC)" };
  }
  const target = stageOrder[idx + 1];
  const v = validate(drawing.stage, target);
  if (!v.ok) {
    return { kind: "error", message: v.reason || "Invalid stage transition" };
  }
  const stageMutation = classify(drawing, target, submittalsBySetId);
  return {
    kind: "dialog",
    target: {
      drawingId: drawing.id,
      setId: drawing.drawing_set_id || null,
      currentStage: drawing.stage as string,
      targetStage: target,
      allowLegacy: !!stageMutation.allowed,
    },
  };
}

export type BulkStagePlan =
  | { kind: "noop" }
  | { kind: "error"; message: string }
  | { kind: "blocked"; message: string }
  | { kind: "apply"; ids: string[]; infoMessage: string };

/** Validate bulk stage apply before touching the DB. */
export function planBulkStageApply(opts: {
  bulkStage: string;
  selected: Set<string> | Iterable<string>;
  drawings: DrawingLike[];
  stageOrder: readonly string[];
  submittalsBySetId: SubmittalsBySetId;
  classify: (
    drawing: DrawingLike,
    targetStage: string,
    submittalsBySetId: SubmittalsBySetId,
  ) => StageMutationDecision;
}): BulkStagePlan {
  const { bulkStage, drawings, stageOrder, submittalsBySetId, classify } = opts;
  const selected = opts.selected instanceof Set ? opts.selected : new Set(opts.selected);
  if (!bulkStage || selected.size === 0) return { kind: "noop" };
  if (!stageOrder.includes(bulkStage)) {
    return { kind: "error", message: `Cannot apply unknown stage "${bulkStage}"` };
  }
  const ids = [...selected];
  const blocked = ids
    .map((id) => drawings.find((d) => d.id === id))
    .filter(Boolean)
    .map((drawing) => classify(drawing as DrawingLike, bulkStage, submittalsBySetId))
    .find((decision) => !decision.allowed);
  if (blocked) {
    return {
      kind: "blocked",
      message:
        "Bulk workflow stage changes must be performed from Submittals; the selection includes a linked set.",
    };
  }
  return {
    kind: "apply",
    ids,
    infoMessage: "Applying legacy sheet-stage recovery to sets without linked submittals.",
  };
}

/** Confirm-dialog copy for bulk sheet delete. */
export function buildBulkDeleteConfirm(count: number): ConfirmDialogPlan | null {
  if (count === 0) return null;
  return {
    title: `Delete ${count} sheet${count === 1 ? "" : "s"}?`,
    description:
      "The selected sheets will be removed from the project. You can undo this from the toast that appears after deletion.",
  };
}

export type BulkWriteToast = {
  level: "warning" | "success";
  message: string;
  clearSelection: boolean;
};

/** Toast after bulk stage / field update. */
export function formatBulkUpdateToast(
  succeeded: number,
  failed: number,
  opts?: { fieldCount?: number },
): BulkWriteToast {
  if (failed > 0) {
    const fieldSuffix =
      opts?.fieldCount != null
        ? ` (${opts.fieldCount} field${opts.fieldCount === 1 ? "" : "s"})`
        : "";
    return {
      level: "warning",
      message: `${succeeded} updated, ${failed} failed${fieldSuffix}`,
      clearSelection: false,
    };
  }
  if (opts?.fieldCount != null) {
    return {
      level: "success",
      message: `Updated ${opts.fieldCount} field${opts.fieldCount === 1 ? "" : "s"} on ${succeeded} sheet${succeeded === 1 ? "" : "s"}`,
      clearSelection: true,
    };
  }
  return {
    level: "success",
    message: `Updated ${succeeded} sheets`,
    clearSelection: true,
  };
}

/** Toast after bulk soft-delete (pre-undo). */
export function formatBulkDeleteToast(succeeded: number, failed: number): BulkWriteToast {
  if (failed > 0) {
    return {
      level: "warning",
      message: `${succeeded} deleted, ${failed} failed`,
      clearSelection: false,
    };
  }
  return {
    level: "success",
    message: `Deleted ${succeeded} sheet${succeeded === 1 ? "" : "s"}`,
    clearSelection: true,
  };
}

/** Normalize openSetApproval target + resolve sheets / display name. */
export function buildApprovalSetState(
  target: string | { name?: string; setId?: string; drawing_set_id?: string } | null | undefined,
  drawings: DrawingLike[],
  drawingSetMap: Record<string, { set_name?: string | null } | undefined>,
): { setName: string; setId: string | null; sheets: DrawingLike[] } | null {
  const normalized = typeof target === "string" ? { name: target } : target || {};
  const setId = normalized.setId || normalized.drawing_set_id || null;
  const sheets = setId
    ? drawings.filter((d) => d.drawing_set_id === setId)
    : drawings.filter(
        (d) => !d.drawing_set_id && d.drawing_set_name?.trim() === normalized.name?.trim(),
      );
  if (!sheets.length) return null;
  const parentName = setId ? drawingSetMap[setId]?.set_name : null;
  return {
    setName: parentName || normalized.name || sheets[0]?.drawing_set_name || "Drawing set",
    setId,
    sheets,
  };
}

/** Rename-modal state from a DrawingsTable group. */
export function buildRenameSetState(
  group: DrawingSetGroupLike | null | undefined,
): { setId: string | null; setName: string; sheets: DrawingLike[] } | null {
  if (!group || group.isUngrouped) return null;
  return {
    setId: resolveGroupSetId(group),
    setName: group.name || "",
    sheets: group.sheets || [],
  };
}

export type MarkerSetPlan =
  | { kind: "noop" }
  | { kind: "error"; message: string }
  | {
      kind: "open";
      markerSet: {
        id: string;
        set_name: string;
        project_id: string | null;
        file_url: string | null;
        titleblock_title_rect: unknown;
        titleblock_number_rect: unknown;
        sheets: DrawingLike[];
      };
    };

/** Titleblock marker modal payload from a group. */
export function buildMarkerSetState(
  group: DrawingSetGroupLike | null | undefined,
  activeProjectId: string | null | undefined,
): MarkerSetPlan {
  if (!group || group.isUngrouped) return { kind: "noop" };
  const setId = resolveGroupSetId(group);
  if (!setId) {
    return {
      kind: "error",
      message: "This group has no parent drawing-set record yet — upload it as a set first.",
    };
  }
  const sheets = group.sheets || [];
  return {
    kind: "open",
    markerSet: {
      id: setId,
      set_name: group.name || "",
      project_id: activeProjectId || sheets[0]?.project_id || null,
      file_url: (group.parent?.file_url as string | null | undefined) || sheets[0]?.file_url || null,
      titleblock_title_rect: group.parent?.titleblock_title_rect ?? null,
      titleblock_number_rect: group.parent?.titleblock_number_rect ?? null,
      sheets,
    },
  };
}

/** Parent set id for set-approval writes. */
export function resolveApprovalParentSetId(approvalSet: {
  setId?: string | null;
  sheets?: DrawingLike[];
}): string | null | undefined {
  return (
    approvalSet.setId ||
    (approvalSet.sheets || []).map((s) => s.drawing_set_id).find(Boolean)
  );
}

/** Effective approval date (YYYY-MM-DD); defaults to local today. */
export function resolveApprovalEffectiveDate(
  approvalDate: string | null | undefined,
  now: Date = new Date(),
): string {
  return approvalDate || now.toISOString().split("T")[0];
}

/** Append `[STATUS] notes` to an existing sheet notes string. */
export function appendApprovalNotes(
  existingNotes: string | null | undefined,
  status: string,
  notes: string | null | undefined,
): string | undefined {
  if (!notes) return undefined;
  return (existingNotes ? existingNotes + "\n" : "") + `[${status.toUpperCase()}] ${notes}`;
}

/** Per-sheet mirror patch for set approval. */
export function buildSheetApprovalPatch(
  sheet: DrawingLike,
  opts: {
    status: string;
    effectiveDate: string;
    revision?: string | null;
    notes?: string | null;
  },
): Record<string, unknown> {
  const appended = appendApprovalNotes(sheet.notes as string | null | undefined, opts.status, opts.notes);
  return {
    set_approval_status: opts.status,
    set_approved_date: opts.effectiveDate,
    ...(opts.revision ? { revision_number: opts.revision } : {}),
    ...(appended != null ? { notes: appended } : {}),
  };
}

/** Parent drawing_sets patch for set approval. */
export function buildParentApprovalPatch(opts: {
  status: string;
  effectiveDate: string;
  approvedBy?: string | null;
  notes?: string | null;
  revision?: string | null;
}): Record<string, unknown> {
  return {
    set_approval_status: opts.status,
    set_approved_date: opts.effectiveDate,
    set_approved_by: opts.approvedBy || null,
    set_approval_notes: opts.notes || null,
    ...(opts.revision ? { revision: opts.revision } : {}),
  };
}

/** Toast after set-approval batch. */
export function formatSetApprovalToast(
  setName: string,
  status: string,
  succeeded: number,
  failed: number,
): BulkWriteToast {
  if (failed > 0) {
    return {
      level: "warning",
      message: `${succeeded} sheets updated, ${failed} failed`,
      clearSelection: false,
    };
  }
  return {
    level: "success",
    message: `Set "${setName}" marked as ${status}`,
    clearSelection: true,
  };
}

/** Rename success / partial-failure copy. */
export function formatRenameSetToast(
  oldName: string,
  newName: string,
  failedSheetCount = 0,
): { level: "success" | "warning"; message: string } {
  if (failedSheetCount > 0) {
    return {
      level: "warning",
      message: `Renamed parent, but ${failedSheetCount} sheet${failedSheetCount === 1 ? "" : "s"} failed`,
    };
  }
  return {
    level: "success",
    message: `Renamed "${oldName}" → "${newName}"`,
  };
}

/** Toggle one id in a selection Set (immutable). */
export function toggleIdInSet(selected: Set<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Select-all / deselect-all for currently visible rows, preserving
 * selections that are off-screen / filtered out.
 */
export function toggleSelectAllIds(
  previous: Set<string>,
  visibleIds: string[],
): Set<string> {
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => previous.has(id));
  const next = new Set(previous);
  visibleIds.forEach((id) => (allVisibleSelected ? next.delete(id) : next.add(id)));
  return next;
}

/**
 * Query string for Submittals handoff from AdvanceStageDialog.
 * Returns "" when neither param is present.
 */
export function buildSubmittalAdvanceSearch(
  setId: string | null | undefined,
  mappedStatus: string | null | undefined,
): string {
  const params = new URLSearchParams();
  if (setId) params.set("targetSetId", setId);
  if (mappedStatus) params.set("prefilledStatus", mappedStatus);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Sheets to mirror when applying set approval. */
export function resolveSheetsToApprove(
  approvalSet: { sheets: DrawingLike[] },
  applyToSheets: boolean,
): DrawingLike[] {
  return applyToSheets ? approvalSet.sheets : [approvalSet.sheets[0]];
}

/** Delete-set mutationFn strategy from setId + sheetIds. */
export type DeleteSetStrategy =
  | { kind: "parentOnly"; setId: string }
  | { kind: "cascade"; setId: string; sheetCount: number }
  | { kind: "legacyChildren"; sheetIds: string[] };

export function planDeleteSetMutation(opts: {
  setId: string | null | undefined;
  sheetIds: string[];
}): DeleteSetStrategy {
  const { setId, sheetIds } = opts;
  if (setId && sheetIds.length === 0) return { kind: "parentOnly", setId };
  if (setId) return { kind: "cascade", setId, sheetCount: sheetIds.length };
  return { kind: "legacyChildren", sheetIds };
}

/** KPI tiles that act as stageFilter toggles flip back to ALL when re-clicked. */
export function toggleStageFilterValue(current: string, target: string): string {
  return current === target ? "ALL" : target;
}
