import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { NavigateFunction } from "react-router-dom";
import { toast } from "sonner";
import {
  entities,
  type RowWithAliases,
  type Update,
} from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { batchProcess } from "@/utils/batchProcess";
import {
  ensureSetLinked,
} from "@/lib/submittalLinkGlue";


import {
  classifyDrawingStageMutation,
  validateStageTransition,
} from "@/components/drawings/drawingsUtils";
import {
  buildDrawingMetadataUpdate,
  formatDrawingWriteError,
} from "./drawingMutationHelpers";
import {
  buildApprovalSetState,
  buildDeleteSetConfirm,
  buildMarkerSetState,
  buildRenameSetState,
  openShopDrawingSubmittalsForSet,
  formatBulkUpdateToast,
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
    mutationFn: async (_payload: Record<string, unknown>): Promise<never> => { throw new Error("Sheet creation is held here. Use the reviewed New Drawing Set workflow."); },
    onError: (error) => toast.error(formatDrawingWriteError(error, "add")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Record<string, unknown>) => {
      const current = drawings.find(drawing => drawing.id === id);
      if (!current) throw new Error("Refresh the drawing register before editing this sheet.");
      return entities.Drawing.update(id, buildDrawingMetadataUpdate(current, payload) as DrawingUpdate);
    },
    onSuccess: async () => {
      await invalidate();
      toast.success("Sheet updated");
      setEditing(null);
      setShowModal(false);
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "update")),
  });

  const deleteSetMut = useMutation({
    mutationFn: async ({ setId }: { setId: string | null; sheetIds: string[]; setName: string }) => {
      if (!setId) throw new Error("Archiving ungrouped sheets is held. A tracked drawing set is required.");
      return entities.DrawingSet.deleteCascade(setId);
    },
    onSuccess: async (result, { setName }) => {
      await invalidate();
      setSelected(new Set());
      toast.success(`Archived "${setName}" and ${result.deletedChildCount} sheets. Restore is held.`);
    },
    onError: (error) => toast.error(formatDrawingWriteError(error, "delete set")),
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

  const handleDelete = (_id: string) => {
    setContextMenu(null);
    toast.info("Individual sheet archive and restore are held. Archive the complete drawing set instead.");
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

  const handleAdvanceStage = (_drawing: DrawingLike) => {
    setContextMenu(null);
    toast.info("Stage changes are held here. Use the governing Submittals review and fabrication-release workflow.");
  };
  const handleBulkStageApply = async () => {
    toast.info("Bulk stage changes are held. Use the governing Submittals review and fabrication-release workflow.");
  };
  const handleBulkDelete = () => {
    toast.info("Individual sheet archive and restore are held. Archive the complete drawing set instead.");
  };

  const handleBulkEdit = async (payload: Record<string, unknown>) => {
    if (selected.size === 0 || Object.keys(payload).length === 0) return;
    setBulkEditOpen(false);
    const fieldCount = Object.keys(payload).length;
    const { succeeded, failed } = await batchProcess(
      [...selected],
      (id: string) => {
        const current = drawings.find((drawing) => drawing.id === id);
        const nextStage = typeof payload.stage === "string" ? payload.stage : null;
        if (current && nextStage) {
          const validation = validateStageTransition(current.stage ?? "", nextStage);
          if (!validation.ok) {
            throw new Error(validation.reason || "Invalid stage transition");
          }
          const classification = classifyDrawingStageMutation(
            current,
            nextStage,
            submittalsBySetId,
          );
          if (!classification.allowed) {
            throw new Error(classification.reason || "Stage transition blocked");
          }
        }
        if (!current) throw new Error("Refresh the drawing register before editing this sheet.");
        return entities.Drawing.update(id, buildDrawingMetadataUpdate(current, payload) as DrawingUpdate);
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

  const handleSetApproval = async (_input: {
    status: string; revision?: string | null; _approvedBy?: string | null;
    approvalDate?: string | null; applyToSheets?: boolean; notes?: string | null;
  }) => {
    toast.info("Direct drawing approval is held. Use the governing Submittals review and fabrication-release workflow.");
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

  const handleRenameSet = async (_newName: string) => {
    toast.info("Set rename and sheet rerouting are held until a reviewed atomic command is available.");
  };

  const toggleSelect = (id: string) =>
    setSelected(toggleIdInSet(selected, id));

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((drawing) => drawing.id);
    setSelected((previous) => toggleSelectAllIds(previous, visibleIds));
  };

  const handleRevisionComplete = (payload?: {
    complete?: boolean;
    setId?: string | null;
    setName?: string | null;
    revisionLabel?: string | null;
  }) => {
    void invalidate();
    // The modal reports partial sheet/history writes so the operator can
    // recover them in place; only a complete save may close the editor or
    // offer to attach its revision to a submittal.
    if (payload?.complete === false) return;
    setRevisionOpen(false);
    const setId = payload?.setId;
    if (!setId) return;
    const candidates = openShopDrawingSubmittalsForSet(setId, submittals);
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
  };

  const handleAttachRevision = async (submittalId: string) => {
    if (!state.attachPrompt) return;
    setAttachBusy(true);
    try {
      const row = submittals.find((submittal) => submittal.id === submittalId);
      if (
        !row ||
        !openShopDrawingSubmittalsForSet(state.attachPrompt.setId, [row]).length
      ) {
        toast.error("That Shop Drawing submittal is no longer open — refresh and try again.");
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
      toast.success("Package link retained. Submit a new review round to capture the revised sheets; earlier review evidence is unchanged.");
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
