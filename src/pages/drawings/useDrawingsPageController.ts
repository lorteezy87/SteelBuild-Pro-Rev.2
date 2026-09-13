import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import {
  entities,
  type Insert,
  type RowWithAliases,
  type Update,
} from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { batchProcess } from "@/utils/batchProcess";
import { autoCreateDetailingTasks } from "@/lib/autoScheduleDetailing";
import { stageToSubmittalStatus } from "@/lib/submittalStageMapping";
import {
  ensureSetLinked,
  openLinkedSubmittalsForSet,
} from "@/lib/submittalLinkGlue";
import {
  STAGE_ORDER,
  stageUpdatePatch,
} from "@/components/drawings/drawingsConfig";
import {
  classifyDrawingStageMutation,
  validateStageTransition,
} from "@/components/drawings/drawingsUtils";
import {
  buildDrawingCreatePayload,
  formatDeleteSetSuccessMessage,
  formatDrawingWriteError,
} from "./drawingMutationHelpers";
import {
  buildApprovalSetState,
  buildBulkDeleteConfirm,
  buildDeleteSetConfirm,
  buildDeleteSheetConfirm,
  buildMarkerSetState,
  buildParentApprovalPatch,
  buildRenameSetState,
  buildSheetApprovalPatch,
  buildSubmittalNavigationSearch,
  formatBulkDeleteToast,
  formatBulkUpdateToast,
  formatRenameSetToast,
  formatSetApprovalToast,
  planAdvanceStage,
  planBulkStageApply,
  planDeleteSetMutation,
  resolveApprovalEffectiveDate,
  resolveApprovalParentSetId,
  resolveSheetsToApprove,
  toggleIdInSet,
  toggleSelectAllIds,
  type DrawingLike,
  type DrawingSetGroupLike,
} from "./drawingActionHelpers";
import type { DrawingsPageData } from "./useDrawingsPageData";
import type { DrawingsPageState } from "./useDrawingsPageState";

type ActiveProject = RowWithAliases<"projects"> | null | undefined;
type DrawingUpdate = Update<"drawings">;

export function useDrawingsPageController({
  activeProject,
  projectId,
  queryClient,
  navigate,
  data,
  state,
}: {
  activeProject: ActiveProject;
  projectId: string | null | undefined;
  queryClient: QueryClient;
  navigate: NavigateFunction;
  data: DrawingsPageData;
  state: DrawingsPageState;
}) {
  const {
    drawings,
    drawingSetMap,
    filtered,
    submittals,
    submittalsBySetId,
  } = data;
  const {
    approvalSet,
    bulkStage,
    renameSet,
    selected,
    setAdvanceTarget,
    setApprovalSet,
    setAttachBusy,
    setAttachPrompt,
    setBulkEditOpen,
    setBulkStage,
    setConfirmState,
    setContextMenu,
    setEditing,
    setMarkerSet,
    setRenameSet,
    setRevisionOpen,
    setSaving,
    setSavingApproval,
    setSavingRename,
    setSelected,
    setShowModal,
  } = state;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["drawings", projectId] }),
      invalidateEntity(queryClient, "drawingSet", projectId),
      invalidateEntity(queryClient, "submittal", projectId),
    ]);
  };

  const createMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) => entities.Drawing.create(
      buildDrawingCreatePayload(
        payload,
        projectId,
        activeProject?.name,
      ) as Insert<"drawings">,
    ),
    onSuccess: async (created) => {
      await invalidate();
      toast.success("Sheet added");
      setShowModal(false);
      if (created?.id) {
        const { created: count, failed } = await autoCreateDetailingTasks(
          [created],
          { projectName: activeProject?.name ?? "" },
        );
        if (count > 0) {
          queryClient.invalidateQueries({ queryKey: ["schedule-tasks"] });
          toast.success("Schedule task auto-created");
        } else if (failed) {
          toast.error("Schedule task failed to create");
        }
      }
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "add")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      entities.Drawing.update(id, payload as DrawingUpdate),
    onSuccess: async () => {
      await invalidate();
      toast.success("Sheet updated");
      setEditing(null);
      setShowModal(false);
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "update")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.Drawing.delete(id),
    onSuccess: async (_result, id) => {
      await invalidate();
      setSelected(new Set());
      toast.success("Sheet deleted", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await entities.Drawing.update(id, {
                is_deleted: false,
                deleted_at: null,
              });
              await invalidate();
              toast.success("Sheet restored");
            } catch (error) {
              toast.error(formatDrawingWriteError(error, "restore"));
            }
          },
        },
      });
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "delete")),
  });

  const deleteSetMut = useMutation({
    mutationFn: async ({
      setId,
      sheetIds,
    }: {
      setId: string | null;
      sheetIds: string[];
      setName: string;
    }) => {
      const strategy = planDeleteSetMutation({ setId, sheetIds });
      if (strategy.kind === "parentOnly") {
        await entities.DrawingSet.delete(strategy.setId);
        return { deleted: 0, parentOnly: true, deletedSheetIds: [], failed: [] };
      }
      if (strategy.kind === "cascade") {
        const result = await entities.DrawingSet.deleteCascade(strategy.setId);
        return {
          deleted: result.deletedChildCount ?? strategy.sheetCount,
          parentOnly: false,
          deletedSheetIds: [],
          failed: [],
        };
      }
      const result = await batchProcess(
        strategy.sheetIds,
        (id: string) => entities.Drawing.delete(id),
      );
      return {
        deleted: result.succeeded.length,
        parentOnly: false,
        deletedSheetIds: result.succeeded.map(({ item }) => item),
        failed: result.failed.map(({ item }) => item),
      };
    },
    onSuccess: async (
      { deleted, parentOnly, deletedSheetIds, failed },
      { setId, sheetIds, setName },
    ) => {
      await invalidate();
      setSelected(failed.length > 0 ? new Set(failed) : new Set());
      const toastInfo = formatDeleteSetSuccessMessage({
        setName,
        deleted,
        parentOnly,
        failedCount: failed.length,
      });
      toast[toastInfo.level](toastInfo.message, {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              if (setId) {
                await entities.DrawingSet.update(setId, {
                  is_deleted: false,
                  deleted_at: null,
                });
              }
              const restoreIds = setId ? sheetIds : deletedSheetIds;
              if (restoreIds.length > 0) {
                const restore = await batchProcess(
                  restoreIds,
                  (id: string) => entities.Drawing.update(id, {
                    is_deleted: false,
                    deleted_at: null,
                  }),
                );
                if (restore.failed.length > 0) {
                  setSelected(new Set(restore.failed.map(({ item }) => item)));
                  throw new Error(
                    `${restore.failed.length} row(s) could not be restored`,
                  );
                }
              }
              await invalidate();
              toast.success(`Restored "${setName}"`);
            } catch (error) {
              toast.error(formatDrawingWriteError(error, "restore"));
            }
          },
        },
      });
    },
    onError: (error) =>
      toast.error(formatDrawingWriteError(error, "delete set")),
  });

  const handleSave = async (form: Record<string, unknown>) => {
    setSaving(true);
    try {
      if (state.editing?.id) {
        await updateMut.mutateAsync({ id: state.editing.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    setContextMenu(null);
    const confirm = buildDeleteSheetConfirm(
      drawings.find((drawing) => drawing.id === id),
    );
    setConfirmState({ ...confirm, run: () => deleteMut.mutate(id) });
  };

  const handleDeleteSet = (group: DrawingSetGroupLike) => {
    const plan = buildDeleteSetConfirm(group);
    if (!plan) return;
    setConfirmState({
      title: plan.title,
      description: plan.description,
      run: () => deleteSetMut.mutate(plan.mutateArgs),
    });
  };

  const handleAdvanceStage = (drawing: DrawingLike) => {
    const plan = planAdvanceStage(
      drawing,
      STAGE_ORDER,
      submittalsBySetId,
      validateStageTransition,
      classifyDrawingStageMutation,
    );
    if (plan.kind === "error") toast.error(plan.message);
    else if (plan.kind === "info") toast.info(plan.message);
    else setAdvanceTarget(plan.target);
    setContextMenu(null);
  };

  const handleBulkStageApply = async () => {
    const plan = planBulkStageApply({
      bulkStage,
      selected,
      drawings,
      stageOrder: STAGE_ORDER,
      submittalsBySetId,
      classify: classifyDrawingStageMutation,
      resolveSetLabel: (setId) => drawingSetMap[setId]?.set_name,
    });
    if (plan.kind === "noop") return;
    if (plan.kind === "error") {
      toast.error(plan.message);
      return;
    }
    if (plan.blockedToast) {
      const targetSetId = plan.blockedToast.blockedSetIds[0] || null;
      const mapped = stageToSubmittalStatus(bulkStage);
      const search = buildSubmittalNavigationSearch({
        setId: targetSetId,
        mapped,
        submittals,
      });
      toast.error(plan.blockedToast.message, {
        duration: 8_000,
        action: {
          label: "Open Submittals",
          onClick: () => navigate(`/Submittals${search}`),
        },
      });
      if (plan.blockedToast.abort) return;
    }
    if (plan.infoMessage) toast.info(plan.infoMessage, { duration: 4_000 });
    const { succeeded, failed } = await batchProcess(plan.ids, (id: string) => {
      const current = drawings.find((drawing) => drawing.id === id);
      if (current) {
        const validation = validateStageTransition(current.stage ?? "", bulkStage);
        if (!validation.ok) {
          throw new Error(validation.reason || "Invalid stage transition");
        }
      }
      return entities.Drawing.update(
        id,
        stageUpdatePatch(bulkStage) as DrawingUpdate,
      );
    });
    await invalidate();
    if (failed.length > 0) {
      toast.warning(`${succeeded.length} updated, ${failed.length} failed`);
      return;
    }
    setSelected(new Set(plan.blockedIds));
    if (plan.blockedIds.length === 0) setBulkStage("");
    toast.success(`Updated ${succeeded.length} sheets`);
  };

  const handleBulkDelete = () => {
    const confirm = buildBulkDeleteConfirm(selected.size);
    if (!confirm) return;
    setConfirmState({
      ...confirm,
      run: async () => {
        const ids = [...selected];
        const { succeeded, failed } = await batchProcess(
          ids,
          (id: string) => entities.Drawing.delete(id),
        );
        await invalidate();
        const toastInfo = formatBulkDeleteToast(
          succeeded.length,
          failed.length,
        );
        if (failed.length > 0) {
          setSelected(new Set(failed.map(({ item }) => item)));
          toast.warning(toastInfo.message);
          return;
        }
        setSelected(new Set());
        toast.success(toastInfo.message, {
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await batchProcess(
                  succeeded.map(({ item }) => item),
                  (id: string) => entities.Drawing.update(id, {
                    is_deleted: false,
                    deleted_at: null,
                  }),
                );
                await invalidate();
                toast.success(
                  `Restored ${succeeded.length} sheet${succeeded.length === 1 ? "" : "s"}`,
                );
              } catch (error) {
                const message = error instanceof Error
                  ? error.message
                  : "unknown";
                toast.error(`Restore failed: ${message}`);
              }
            },
          },
        });
      },
    });
  };

  const handleBulkEdit = async (payload: Record<string, unknown>) => {
    if (selected.size === 0 || Object.keys(payload).length === 0) return;
    setBulkEditOpen(false);
    const fieldCount = Object.keys(payload).length;
    const targetStage = typeof payload.stage === "string"
      ? payload.stage
      : null;
    const { succeeded, failed } = await batchProcess(
      [...selected],
      (id: string) => {
        const current = drawings.find((drawing) => drawing.id === id);
        if (current && targetStage) {
          const transition = validateStageTransition(
            current.stage ?? "",
            targetStage,
          );
          if (!transition.ok) throw new Error(transition.reason);

          const classification = classifyDrawingStageMutation(
            current,
            targetStage,
            submittalsBySetId,
          );
          if (!classification.allowed) {
            throw new Error(classification.reason);
          }
        }
        return entities.Drawing.update(id, payload as DrawingUpdate);
      },
    );
    await invalidate();
    const toastInfo = formatBulkUpdateToast(
      succeeded.length,
      failed.length,
      { fieldCount },
    );
    if (failed.length > 0) {
      setSelected(new Set(failed.map(({ item }) => item)));
    }
    else if (toastInfo.clearSelection) setSelected(new Set());
    toast[toastInfo.level](toastInfo.message);
  };

  const handleSetApproval = async ({
    status,
    revision,
    _approvedBy,
    approvalDate,
    applyToSheets,
    notes,
  }: {
    status: string;
    revision?: string | null;
    _approvedBy?: string | null;
    approvalDate?: string | null;
    applyToSheets?: boolean;
    notes?: string | null;
  }) => {
    if (!approvalSet) return;
    setSavingApproval(true);
    try {
      const effectiveDate = resolveApprovalEffectiveDate(approvalDate);
      const parentSetId = resolveApprovalParentSetId(approvalSet);
      if (parentSetId) {
        await entities.DrawingSet.update(
          parentSetId,
          buildParentApprovalPatch({
            status,
            effectiveDate,
            approvedBy: _approvedBy,
            notes,
            revision,
          }),
        );
      }
      const sheetsToUpdate = resolveSheetsToApprove(
        approvalSet,
        applyToSheets ?? false,
      );
      const { succeeded, failed } = await batchProcess(
        sheetsToUpdate,
        (sheet: DrawingLike) => entities.Drawing.update(
          sheet.id,
          buildSheetApprovalPatch(sheet, {
            status,
            effectiveDate,
            revision,
            notes,
          }) as DrawingUpdate,
        ),
      );
      await invalidate();
      const toastInfo = formatSetApprovalToast(
        approvalSet.setName,
        status,
        succeeded.length,
        failed.length,
      );
      toast[toastInfo.level](toastInfo.message);
      if (toastInfo.clearSelection) setApprovalSet(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Approval update failed: ${message}`);
    } finally {
      setSavingApproval(false);
    }
  };

  const openSetApproval = (
    target:
      | string
      | { name?: string; setId?: string; drawing_set_id?: string }
      | null
      | undefined,
  ) => {
    const next = buildApprovalSetState(target, drawings, drawingSetMap);
    if (next) setApprovalSet(next);
  };

  const openRenameSet = (group: DrawingSetGroupLike) => {
    const next = buildRenameSetState(group);
    if (next) setRenameSet(next);
  };

  const openMarkTitleblock = (group: DrawingSetGroupLike) => {
    const plan = buildMarkerSetState(group, activeProject?.id);
    if (plan.kind === "noop") return;
    if (plan.kind === "error") {
      toast.error(plan.message);
      return;
    }
    setMarkerSet(plan.markerSet);
  };

  const handleRenameSet = async (newName: string) => {
    if (!renameSet) return;
    const { setId, setName: oldName, sheets } = renameSet;
    setSavingRename(true);
    try {
      if (setId) {
        await entities.DrawingSet.update(setId, { set_name: newName });
      }
      const sheetIds = sheets.map((sheet) => sheet.id);
      if (sheetIds.length > 0) {
        const result = await batchProcess(
          sheetIds,
          (id: string) => entities.Drawing.update(id, {
            drawing_set_name: newName,
          }),
        );
        if (result.failed.length > 0) {
          await invalidate();
          setSelected(new Set(result.failed.map(({ item }) => item)));
          const toastInfo = formatRenameSetToast(
            oldName,
            newName,
            result.failed.length,
          );
          toast[toastInfo.level](toastInfo.message);
          return;
        }
      }
      await invalidate();
      const toastInfo = formatRenameSetToast(oldName, newName);
      toast[toastInfo.level](toastInfo.message);
      setRenameSet(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Rename failed: ${message}`);
    } finally {
      setSavingRename(false);
    }
  };

  const toggleSelect = (id: string) =>
    setSelected(toggleIdInSet(selected, id));

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((drawing) => drawing.id);
    setSelected((previous) => toggleSelectAllIds(previous, visibleIds));
  };

  const handleRevisionComplete = (payload?: {
    setId?: string | null;
    setName?: string | null;
    revisionLabel?: string | null;
  }) => {
    void invalidate();
    setRevisionOpen(false);
    const setId = payload?.setId;
    if (!setId) return;
    const candidates = openLinkedSubmittalsForSet(setId, submittals);
    if (candidates.length === 0) return;
    setAttachPrompt({
      setId,
      setName: payload?.setName || null,
      revisionLabel: payload?.revisionLabel || null,
      candidates,
    });
  };

  const handleDrawingImportComplete = () => {
    void invalidate();
    queryClient.invalidateQueries({ queryKey: ["drawing_sets", projectId] });
  };

  const handleAttachRevision = async (submittalId: string) => {
    if (!state.attachPrompt) return;
    setAttachBusy(true);
    try {
      const row = submittals.find((submittal) => submittal.id === submittalId);
      if (
        !row ||
        !openLinkedSubmittalsForSet(state.attachPrompt.setId, [row]).length
      ) {
        toast.error("That submittal is no longer open — refresh and try again.");
        setAttachPrompt(null);
        await invalidate();
        return;
      }
      const nextIds = ensureSetLinked(
        row.drawing_set_ids,
        state.attachPrompt.setId,
      );
      await entities.Submittal.update(submittalId, {
        drawing_set_ids: nextIds,
      });
      toast.success("Revision kept linked to open submittal");
      setAttachPrompt(null);
      await invalidate();
      await invalidateEntity(queryClient, "submittal", projectId);
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to attach revision to submittal";
      toast.error(message);
    } finally {
      setAttachBusy(false);
    }
  };

  return {
    invalidate,
    updateMut,
    handleSave,
    handleDelete,
    handleDeleteSet,
    handleAdvanceStage,
    handleBulkStageApply,
    handleBulkDelete,
    handleBulkEdit,
    handleSetApproval,
    openSetApproval,
    openRenameSet,
    openMarkTitleblock,
    handleRenameSet,
    toggleSelect,
    toggleSelectAll,
    handleDrawingImportComplete,
    handleRevisionComplete,
    handleAttachRevision,
  };
}

export type DrawingsPageController = ReturnType<
  typeof useDrawingsPageController
>;
