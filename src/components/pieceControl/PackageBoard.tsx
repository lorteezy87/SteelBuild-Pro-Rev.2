import { useMemo, useState } from "react";
import {
  DragDropContext,
  type DropResult,
} from "@hello-pangea/dnd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import "@/styles/piece-control-command.css";
import { PIECE_LIFECYCLE_LABELS } from "@/lib/pieceControl/lifecycle";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import {
  assignPiecesToWorkPackage,
  fetchPieceRelationshipSnapshot,
  unassignPiecesFromWorkPackage,
} from "@/lib/pieceControl/relationshipsRepository";
import {
  UNASSIGNED_COLUMN_ID,
  buildPackageBoardColumns,
} from "./packageBoard.derive";
import { PackageBoardColumn } from "./PackageBoardColumn";

type BoardModeTab = "packages" | "lifecycle" | "model3d";

interface PackageBoardProps {
  projectId: string;
  pieceControlMode?: string;
}

const LIFECYCLE_OPTIONS = Object.entries(PIECE_LIFECYCLE_LABELS);

export default function PackageBoard({
  projectId,
  pieceControlMode = "off",
}: PackageBoardProps) {
  const enabled = Boolean(projectId && pieceControlMode !== "off");
  const queryClient = useQueryClient();
  const [boardMode, setBoardMode] = useState<BoardModeTab>("packages");
  const [markFilter, setMarkFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");
  const [assignmentOverrides, setAssignmentOverrides] = useState<
    Record<string, string | null>
  >({});

  const snapshotQuery = useQuery({
    queryKey: ["piece-relationships", projectId],
    queryFn: () => fetchPieceRelationshipSnapshot(projectId),
    enabled,
    staleTime: 15_000,
  });

  const columns = useMemo(
    () =>
      buildPackageBoardColumns({
        pieces: snapshotQuery.data?.pieces ?? [],
        workPackages: snapshotQuery.data?.workPackages ?? [],
        markFilter,
        lifecycleFilter,
        assignmentOverrides,
      }),
    [
      assignmentOverrides,
      lifecycleFilter,
      markFilter,
      snapshotQuery.data?.pieces,
      snapshotQuery.data?.workPackages,
    ],
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["piece-relationships", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["work-packages", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["workPackages", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["model-elements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["modelElements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["canonical-pieces-3d", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["ifc", projectId] }),
    ]);
  };

  const moveMutation = useMutation({
    mutationFn: async ({
      pieceId,
      targetColumnId,
    }: {
      pieceId: string;
      sourceColumnId: string;
      targetColumnId: string;
    }) => {
      if (targetColumnId === UNASSIGNED_COLUMN_ID) {
        return unassignPiecesFromWorkPackage(projectId, [pieceId]);
      }
      return assignPiecesToWorkPackage(projectId, [pieceId], targetColumnId);
    },
    onSuccess: async (summary, variables) => {
      setAssignmentOverrides((prev) => {
        const next = { ...prev };
        delete next[variables.pieceId];
        return next;
      });
      await invalidate();
      if (variables.targetColumnId === UNASSIGNED_COLUMN_ID) {
        toast.success(`${summary.unassigned ?? 1} piece(s) unassigned`);
        return;
      }
      const synced = Number(summary.model_elements_synced ?? 0);
      toast.success(
        synced > 0
          ? `${summary.assigned ?? 1} piece(s) assigned · ${synced} 3D element(s) synced`
          : `${summary.assigned ?? 1} piece(s) assigned to work package`,
      );
    },
    onError: (error: Error, variables) => {
      setAssignmentOverrides((prev) => {
        const next = { ...prev };
        delete next[variables.pieceId];
        return next;
      });
      toast.error(
        presentPieceControlError(error, "Could not update package assignment."),
      );
    },
  });

  const dragEnabled =
    enabled && boardMode === "packages" && !moveMutation.isPending;

  const handleDragEnd = (result: DropResult) => {
    if (!dragEnabled) return;
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;

    const targetColumnId = destination.droppableId;
    const sourceColumnId = source.droppableId;

    if (
      sourceColumnId !== UNASSIGNED_COLUMN_ID &&
      targetColumnId !== UNASSIGNED_COLUMN_ID
    ) {
      const sourceTitle =
        columns.find((c) => c.id === sourceColumnId)?.title ?? "current package";
      const targetTitle =
        columns.find((c) => c.id === targetColumnId)?.title ?? "target package";
      const confirmed = window.confirm(
        `Reassign this lot from ${sourceTitle} to ${targetTitle}?`,
      );
      if (!confirmed) return;
    }

    const nextAssignment =
      targetColumnId === UNASSIGNED_COLUMN_ID ? null : targetColumnId;
    setAssignmentOverrides((prev) => ({
      ...prev,
      [draggableId]: nextAssignment,
    }));

    moveMutation.mutate({
      pieceId: draggableId,
      sourceColumnId,
      targetColumnId,
    });
  };

  if (!enabled) {
    return (
      <div className="piece-relationship-state is-warning" data-skin="command">
        <div className="piece-relationship-state__title">
          <AlertTriangle size={16} />
          Package Board is unavailable
        </div>
        <p>Set up the Piece Register for this project to drag lots onto work packages.</p>
      </div>
    );
  }

  if (snapshotQuery.isLoading) {
    return (
      <div className="piece-relationship-state" data-skin="command">
        Loading package board…
      </div>
    );
  }

  if (snapshotQuery.error || !snapshotQuery.data) {
    return (
      <div className="piece-relationship-state is-error" data-skin="command">
        <span>
          {presentPieceControlError(
            snapshotQuery.error,
            "Package board could not be loaded.",
          )}
        </span>
        <button
          type="button"
          className="cmd-btn cmd-btn--secondary"
          onClick={() => void snapshotQuery.refetch()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="package-board" data-skin="command" data-testid="package-board">
      <div className="package-board__toolbar">
        <div className="package-board__modes" role="tablist" aria-label="Board mode">
          <button
            type="button"
            role="tab"
            aria-selected={boardMode === "packages"}
            className={[
              "package-board__mode",
              boardMode === "packages" ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setBoardMode("packages")}
          >
            <LayoutGrid size={14} aria-hidden="true" />
            Packages
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="package-board__mode"
            disabled
            title="Coming next"
          >
            Lifecycle
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            className="package-board__mode"
            disabled
            title="Coming next"
          >
            3D
          </button>
        </div>

        <div className="package-board__filters">
          <label className="package-board__field">
            Mark
            <input
              type="search"
              placeholder="Search mark or lot"
              value={markFilter}
              onChange={(event) => setMarkFilter(event.target.value)}
              data-testid="package-board-mark-filter"
            />
          </label>
          <label className="package-board__field">
            Lifecycle
            <select
              value={lifecycleFilter}
              onChange={(event) => setLifecycleFilter(event.target.value)}
              data-testid="package-board-lifecycle-filter"
            >
              <option value="">All lifecycles</option>
              {LIFECYCLE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <p className="package-board__hint">
        Drag a lot onto a work package to assign. Drop on Unassigned to clear.
        Reassign between packages asks for confirmation.
      </p>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="package-board__columns">
          {columns.map((column) => (
            <PackageBoardColumn
              key={column.id}
              column={column}
              dragEnabled={dragEnabled}
            />
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
