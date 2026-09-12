import type { Dispatch, SetStateAction } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { linkPiecesToDrawingSet } from "@/lib/pieceControl/bulkLinkDrawings";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { invalidatePieceControlQueries } from "@/lib/pieceControl/queryKeys";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";
import type { ReadinessWorkPackage } from "@/lib/pieceControl/readiness";
import {
  assignPiecesToWorkPackage,
  linkPieceDrawingSet,
  unassignPiecesFromWorkPackage,
  unlinkPieceDrawingSet,
} from "@/lib/pieceControl/relationshipsRepository";
import {
  applyWorkPackageAutoAssign,
  planWorkPackageAutoAssign,
  type AutoAssignPlan,
} from "@/lib/pieceControl/wpAutoAssign";

export interface UsePieceRelationshipMutationsInput {
  projectId: string;
  queryClient: QueryClient;
  focusedWorkPackageId?: string;
  targetWorkPackageId: string;
  selectedPieceIds: Set<string>;
  selectedDrawingPieceId: string;
  drawingSetId: string;
  packageScopedLeaves: PieceRegisterRow[];
  workPackages: ReadinessWorkPackage[];
  setSelectedPieceIds: Dispatch<SetStateAction<Set<string>>>;
  setDrawingSetId: Dispatch<SetStateAction<string>>;
  setAutoAssignPlan: Dispatch<SetStateAction<AutoAssignPlan | null>>;
}

export function usePieceRelationshipMutations({
  projectId,
  queryClient,
  focusedWorkPackageId,
  targetWorkPackageId,
  selectedPieceIds,
  selectedDrawingPieceId,
  drawingSetId,
  packageScopedLeaves,
  workPackages,
  setSelectedPieceIds,
  setDrawingSetId,
  setAutoAssignPlan,
}: UsePieceRelationshipMutationsInput) {
  const invalidate = async () => {
    await Promise.all([
      invalidatePieceControlQueries(queryClient, projectId, "all"),
      queryClient.invalidateQueries({ queryKey: ["modelElements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["ifc", projectId] }),
    ]);
  };
  const onMutationError = (error: Error) =>
    toast.error(
      presentPieceControlError(
        error,
        "The piece relationship could not be updated.",
      ),
    );
  const resetSelectionAndInvalidate = async () => {
    setSelectedPieceIds(new Set());
    await invalidate();
  };
  const assignMutation = useMutation({
    mutationFn: () =>
      assignPiecesToWorkPackage(
        projectId,
        [...selectedPieceIds],
        focusedWorkPackageId || targetWorkPackageId,
      ),
    onSuccess: async (summary) => {
      await resetSelectionAndInvalidate();
      const synced = Number(summary.model_elements_synced ?? 0);
      toast.success(
        synced > 0
          ? `${summary.assigned ?? 0} piece(s) assigned · ${synced} 3D element(s) synced`
          : `${summary.assigned ?? 0} piece(s) assigned to work package`,
      );
    },
    onError: onMutationError,
  });
  const unassignMutation = useMutation({
    mutationFn: () =>
      unassignPiecesFromWorkPackage(projectId, [...selectedPieceIds]),
    onSuccess: async (summary) => {
      await resetSelectionAndInvalidate();
      toast.success(
        `${summary.unassigned ?? 0} piece(s) removed from work package`,
      );
    },
    onError: onMutationError,
  });
  const linkMutation = useMutation({
    mutationFn: () =>
      linkPieceDrawingSet(projectId, selectedDrawingPieceId, drawingSetId),
    onSuccess: async (summary) => {
      setDrawingSetId("");
      await resetSelectionAndInvalidate();
      toast.success(
        summary.linked
          ? "Drawing set linked"
          : "Drawing set was already linked",
      );
    },
    onError: onMutationError,
  });
  const bulkLinkMutation = useMutation({
    mutationFn: () =>
      linkPiecesToDrawingSet(
        [...selectedPieceIds],
        drawingSetId,
        (pieceId, targetSetId) =>
          linkPieceDrawingSet(projectId, pieceId, targetSetId),
      ),
    onSuccess: async (result) => {
      await resetSelectionAndInvalidate();
      if (result.errors.length > 0) {
        toast.error(
          `Linked ${result.linked}; ${result.errors.length} piece(s) failed.`,
        );
        return;
      }
      toast.success(`Linked drawing set to ${result.linked} piece(s)`);
    },
    onError: onMutationError,
  });
  const unlinkMutation = useMutation({
    mutationFn: ({
      pieceId,
      targetDrawingSetId,
    }: {
      pieceId: string;
      targetDrawingSetId: string;
    }) => unlinkPieceDrawingSet(projectId, pieceId, targetDrawingSetId),
    onSuccess: async (summary) => {
      await resetSelectionAndInvalidate();
      toast.success(
        summary.unlinked
          ? "Drawing set unlinked"
          : "Drawing set link was already absent",
      );
    },
    onError: onMutationError,
  });

  const buildAutoAssignPlan = (reassignExisting: boolean) => {
    const pieces = packageScopedLeaves.map((piece) => ({
      id: piece.id,
      mark: piece.piece_mark,
      work_package_id: piece.work_package_id,
      sequence_number: piece.sequence_number,
      erection_area: piece.erection_area,
      metadata: piece.metadata,
      is_deleted: Boolean(piece.is_deleted || piece.deleted_at),
    }));
    const scopedWorkPackages = focusedWorkPackageId
      ? workPackages.filter((wp) => wp.id === focusedWorkPackageId)
      : workPackages;
    return planWorkPackageAutoAssign(pieces, scopedWorkPackages, {
      reassignExisting,
    });
  };
  const autoAssignMutation = useMutation({
    mutationFn: async (plan: AutoAssignPlan) =>
      applyWorkPackageAutoAssign(plan, (workPackageId, pieceIds) =>
        assignPiecesToWorkPackage(projectId, pieceIds, workPackageId),
      ),
    onSuccess: async (result) => {
      setAutoAssignPlan(null);
      setSelectedPieceIds(new Set());
      await invalidate();
      if (result.errors.length > 0) {
        toast.error(
          `Auto-assign partially failed: ${result.assignedCount} assigned, ${result.errors.length} package error(s).`,
        );
        return;
      }
      toast.success(
        `Auto-assigned ${result.assignedCount} piece(s) across ${result.workPackageCount} work package(s)`,
      );
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(error, "Auto-assign could not be applied."),
      ),
  });

  return {
    assignMutation,
    unassignMutation,
    linkMutation,
    bulkLinkMutation,
    unlinkMutation,
    autoAssignMutation,
    buildAutoAssignPlan,
  };
}
