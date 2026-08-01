import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, PackageCheck, Sparkles, Unlink2 } from "lucide-react";
import { toast } from "sonner";
import "@/styles/piece-control-command.css";
import { DecisionPanel, Pill } from "@/components/command";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { evaluateWorkPackageReadiness } from "@/lib/pieceControl/readiness";
import {
  assignPiecesToWorkPackage,
  fetchPieceRelationshipSnapshot,
  linkPieceDrawingSet,
  unassignPiecesFromWorkPackage,
  unlinkPieceDrawingSet,
} from "@/lib/pieceControl/relationshipsRepository";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";
import { linkPiecesToDrawingSet } from "@/lib/pieceControl/bulkLinkDrawings";
import {
  addIdsToSelection,
  selectIdRange,
} from "@/lib/pieceControl/pieceSelectionRange";
import { sortPieceRegisterRows } from "@/lib/pieceControl/pieceRegisterSort";
import {
  applyWorkPackageAutoAssign,
  planWorkPackageAutoAssign,
  type AutoAssignPlan,
} from "@/lib/pieceControl/wpAutoAssign";
import { formatWorkPackageTitle } from "@/lib/workPackages/formatWorkPackageTitle";

interface PieceRelationshipManagerProps {
  projectId: string;
  pieceControlMode?: string;
  focusedWorkPackageId?: string;
  compact?: boolean;
}

const READINESS_BLOCKER_COPY: Record<string, string> = {
  "No canonical pieces assigned to this work package.":
    "No active pieces assigned to this work package.",
};

const READINESS_MATERIAL_COPY: Record<string, string> = {
  "not yet evaluated in this release.": "Material status is not available.",
};

export default function PieceRelationshipManager({
  projectId,
  pieceControlMode,
  focusedWorkPackageId,
  compact = false,
}: PieceRelationshipManagerProps) {
  const projectContext = useProjectContext() as any;
  const activeProject = projectContext.activeProject as any;
  const mode = pieceControlMode ??
    (activeProject?.id === projectId ? String(activeProject?.piece_control_mode ?? "off") : "off");
  const enabled = Boolean(projectId && mode !== "off");
  const queryClient = useQueryClient();
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(new Set());
  const [targetWorkPackageId, setTargetWorkPackageId] = useState(focusedWorkPackageId ?? "");
  const [drawingPieceId, setDrawingPieceId] = useState("");
  const [drawingSetId, setDrawingSetId] = useState("");
  const [drawingFilter, setDrawingFilter] = useState("");
  const [markFilter, setMarkFilter] = useState("");
  const [needsDrawingOnly, setNeedsDrawingOnly] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<"unassigned" | "package" | "all">(
    focusedWorkPackageId ? "unassigned" : "all",
  );
  const [autoAssignPlan, setAutoAssignPlan] = useState<AutoAssignPlan | null>(null);
  const [autoAssignReassign, setAutoAssignReassign] = useState(false);
  const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);

  const snapshotQuery = useQuery({
    queryKey: ["piece-relationships", projectId],
    queryFn: () => fetchPieceRelationshipSnapshot(projectId),
    enabled,
    staleTime: 15_000,
  });
  const snapshot = snapshotQuery.data;

  const containerIds = useMemo(
    () => new Set(
      (snapshot?.pieces ?? [])
        .map((piece) => piece.parent_piece_id)
        .filter((id): id is string => Boolean(id)),
    ),
    [snapshot?.pieces],
  );
  const leafPieces = useMemo(
    () => (snapshot?.pieces ?? []).filter(
      (piece) => !piece.is_container && !containerIds.has(piece.id),
    ),
    [containerIds, snapshot?.pieces],
  );
  const workPackageMap = useMemo(
    () => new Map(
      (snapshot?.workPackages ?? []).map((wp) => [wp.id, formatWorkPackageTitle(wp)]),
    ),
    [snapshot?.workPackages],
  );
  const drawingLinkCountByPiece = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of snapshot?.pieceDrawingSets ?? []) {
      map.set(link.piece_id, (map.get(link.piece_id) ?? 0) + 1);
    }
    return map;
  }, [snapshot?.pieceDrawingSets]);

  const liveWorkPackageId = (piece: { work_package_id?: string | null }) =>
    piece.work_package_id && workPackageMap.has(piece.work_package_id)
      ? piece.work_package_id
      : null;

  const packageScopedLeaves = focusedWorkPackageId
    ? leafPieces.filter((piece) => {
      const liveId = liveWorkPackageId(piece);
      return !liveId || liveId === focusedWorkPackageId;
    })
    : leafPieces;

  const selectablePieces = useMemo(() => {
    const mark = markFilter.trim().toLowerCase();
    const filtered = packageScopedLeaves.filter((piece) => {
      const liveId = liveWorkPackageId(piece);
      if (scopeFilter === "unassigned" && liveId) return false;
      if (
        scopeFilter === "package" &&
        focusedWorkPackageId &&
        liveId !== focusedWorkPackageId
      ) {
        return false;
      }
      if (mark && !String(piece.piece_mark || "").toLowerCase().includes(mark)) {
        return false;
      }
      if (needsDrawingOnly && (drawingLinkCountByPiece.get(piece.id) ?? 0) > 0) {
        return false;
      }
      return true;
    });
    return sortPieceRegisterRows(
      filtered.map((piece) => ({
        ...piece,
        workPackageLabel: liveWorkPackageId(piece)
          ? workPackageMap.get(liveWorkPackageId(piece)!) ?? "Unassigned"
          : "Unassigned",
      })),
      { key: "work_package", direction: "asc" },
    );
  }, [
    drawingLinkCountByPiece,
    focusedWorkPackageId,
    markFilter,
    needsDrawingOnly,
    packageScopedLeaves,
    scopeFilter,
    workPackageMap,
  ]);

  useEffect(() => {
    if (
      selectionAnchorId &&
      !selectablePieces.some((piece) => piece.id === selectionAnchorId)
    ) {
      setSelectionAnchorId(null);
    }
  }, [selectablePieces, selectionAnchorId]);

  const drawingPieces = focusedWorkPackageId
    ? leafPieces.filter((piece) => liveWorkPackageId(piece) === focusedWorkPackageId)
    : leafPieces;

  const selectedTons = useMemo(() => {
    let lbs = 0;
    let known = 0;
    for (const piece of selectablePieces) {
      if (!selectedPieceIds.has(piece.id)) continue;
      const each = Number(piece.weight_each_lbs);
      const qty = Number(piece.quantity) || 0;
      const total = Number(piece.weight_total_lbs);
      const weight =
        Number.isFinite(each) && each >= 0 && qty > 0
          ? each * qty
          : Number.isFinite(total) && total >= 0
            ? total
            : null;
      if (weight !== null) {
        lbs += weight;
        known += 1;
      }
    }
    return { tons: lbs / 2000, known, selected: selectedPieceIds.size };
  }, [selectablePieces, selectedPieceIds]);

  const readiness = useMemo(() => {
    if (!snapshot) return [];
    return evaluateWorkPackageReadiness(
      snapshot.workPackages,
      snapshot.pieces,
      snapshot.pieceDrawings,
      snapshot.drawings,
      {
        drawingSets: snapshot.drawingSets,
        submittals: snapshot.submittals,
        sheetResponses: snapshot.sheetResponses,
        drawingRevisions: snapshot.drawingRevisions,
        drawingReviews: snapshot.drawingReviews,
        drawingSignoffs: snapshot.drawingSignoffs,
      },
      snapshot.pieceDrawingSets ?? [],
    );
  }, [snapshot]);
  const visibleReadiness = focusedWorkPackageId
    ? readiness.filter((row) => row.workPackageId === focusedWorkPackageId)
    : readiness;
  const selectedDrawingPieceId = drawingPieceId || drawingPieces[0]?.id || "";
  const linksForPiece = (snapshot?.pieceDrawingSets ?? []).filter(
    (link) => link.piece_id === selectedDrawingPieceId,
  );
  const drawingSetMap = new Map(
    (snapshot?.drawingSets ?? []).map((set) => [set.id, set]),
  );
  const activeDrawingSets = useMemo(
    () =>
      (snapshot?.drawingSets ?? []).filter(
        (set) => !set.is_deleted && !set.deleted_at,
      ),
    [snapshot?.drawingSets],
  );
  const filteredDrawingSets = useMemo(() => {
    const needle = drawingFilter.trim().toLowerCase();
    if (!needle) return activeDrawingSets;
    return activeDrawingSets.filter((set) => {
      const name = String(set.set_name ?? "").toLowerCase();
      return name.includes(needle) || set.id.toLowerCase().includes(needle);
    });
  }, [activeDrawingSets, drawingFilter]);

  const allVisibleSelected =
    selectablePieces.length > 0 &&
    selectablePieces.every((piece) => selectedPieceIds.has(piece.id));

  const selectAllVisible = () => {
    setSelectedPieceIds(new Set(selectablePieces.map((piece) => piece.id)));
    setSelectionAnchorId(selectablePieces[0]?.id ?? null);
  };

  const clearSelection = () => {
    setSelectedPieceIds(new Set());
    setSelectionAnchorId(null);
  };

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["piece-relationships", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["piece-register", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["work-packages", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["workPackages", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["model-elements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["modelElements", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["ifc", projectId] }),
    ]);
  };
  const mutationOptions = {
    onSuccess: async () => {
      setSelectedPieceIds(new Set());
      await invalidate();
    },
    onError: (error: Error) =>
      toast.error(
        presentPieceControlError(
          error,
          "The piece relationship could not be updated.",
        ),
      ),
  };
  const assignMutation = useMutation({
    mutationFn: () => assignPiecesToWorkPackage(
      projectId,
      [...selectedPieceIds],
      focusedWorkPackageId || targetWorkPackageId,
    ),
    ...mutationOptions,
    onSuccess: async (summary) => {
      await mutationOptions.onSuccess();
      const synced = Number(summary.model_elements_synced ?? 0);
      toast.success(
        synced > 0
          ? `${summary.assigned ?? 0} piece(s) assigned · ${synced} 3D element(s) synced`
          : `${summary.assigned ?? 0} piece(s) assigned to work package`,
      );
    },
  });
  const unassignMutation = useMutation({
    mutationFn: () => unassignPiecesFromWorkPackage(projectId, [...selectedPieceIds]),
    ...mutationOptions,
    onSuccess: async (summary) => {
      await mutationOptions.onSuccess();
      toast.success(`${summary.unassigned ?? 0} piece(s) removed from work package`);
    },
  });
  const linkMutation = useMutation({
    mutationFn: () =>
      linkPieceDrawingSet(projectId, selectedDrawingPieceId, drawingSetId),
    ...mutationOptions,
    onSuccess: async (summary) => {
      setDrawingSetId("");
      await mutationOptions.onSuccess();
      toast.success(
        summary.linked ? "Drawing set linked" : "Drawing set was already linked",
      );
    },
  });
  const bulkLinkMutation = useMutation({
    mutationFn: () =>
      linkPiecesToDrawingSet(
        [...selectedPieceIds],
        drawingSetId,
        (pieceId, targetSetId) =>
          linkPieceDrawingSet(projectId, pieceId, targetSetId),
      ),
    ...mutationOptions,
    onSuccess: async (result) => {
      await mutationOptions.onSuccess();
      if (result.errors.length > 0) {
        toast.error(
          `Linked ${result.linked}; ${result.errors.length} piece(s) failed.`,
        );
        return;
      }
      toast.success(`Linked drawing set to ${result.linked} piece(s)`);
    },
  });
  const unlinkMutation = useMutation({
    mutationFn: ({
      pieceId,
      targetDrawingSetId,
    }: {
      pieceId: string;
      targetDrawingSetId: string;
    }) => unlinkPieceDrawingSet(projectId, pieceId, targetDrawingSetId),
    ...mutationOptions,
    onSuccess: async (summary) => {
      await mutationOptions.onSuccess();
      toast.success(
        summary.unlinked
          ? "Drawing set unlinked"
          : "Drawing set link was already absent",
      );
    },
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
    let workPackages = snapshot?.workPackages ?? [];
    if (focusedWorkPackageId) {
      workPackages = workPackages.filter((wp) => wp.id === focusedWorkPackageId);
    }
    return planWorkPackageAutoAssign(pieces, workPackages, { reassignExisting });
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

  const autoAssignSkipSummary = useMemo(() => {
    if (!autoAssignPlan) return null;
    const counts: Record<string, number> = {};
    for (const row of autoAssignPlan.skipped) {
      counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    }
    return counts;
  }, [autoAssignPlan]);

  const runAssign = () => {
    const target = focusedWorkPackageId || targetWorkPackageId;
    const reassigning = [...selectedPieceIds].some((id) => {
      const piece = leafPieces.find((row) => row.id === id);
      return piece?.work_package_id && piece.work_package_id !== target;
    });
    if (
      reassigning &&
      !window.confirm(
        "Some selected pieces are already on another work package. Reassign them?",
      )
    ) {
      return;
    }
    assignMutation.mutate();
  };

  if (!enabled) {
    return (
      <div className="piece-relationship-state is-warning" data-skin="command">
        <div className="piece-relationship-state__title">
          <AlertTriangle size={16} />
          Piece relationship controls are disabled
        </div>
        <p>Set up the Piece Register for this project to manage active piece scope.</p>
      </div>
    );
  }

  if (snapshotQuery.isLoading) {
    return <div className="piece-relationship-state" data-skin="command">Loading piece relationships…</div>;
  }

  if (snapshotQuery.error || !snapshot) {
    return (
      <div className="piece-relationship-state is-error" data-skin="command">
        <span>
          {presentPieceControlError(
            snapshotQuery.error,
            "Piece relationships could not be loaded.",
          )}
        </span>
        <button
          type="button"
          className="cmd-btn cmd-btn--secondary"
          onClick={() => void snapshotQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={`piece-relationships${compact ? " is-compact" : ""}`} data-skin="command">
      <DecisionPanel title={focusedWorkPackageId ? "Pieces" : "Piece assignments"}>
        <div className="piece-command-intro">
          <span className="piece-command-intro__icon" aria-hidden="true">
            <PackageCheck size={18} />
          </span>
          <p>
            Filter → <strong>Select all</strong> → Assign to WP → Link drawing set.
            Shift-click for ranges.
          </p>
        </div>

        {!focusedWorkPackageId && (
          <label className="piece-command-field" htmlFor="piece-assignment-work-package">
            Target work package
            <select
              id="piece-assignment-work-package"
              value={targetWorkPackageId}
              onChange={(event) => setTargetWorkPackageId(event.target.value)}
              className="piece-command-control"
            >
              <option value="">Select package</option>
              {snapshot.workPackages.map((wp) => (
                <option key={wp.id} value={wp.id}>{workPackageMap.get(wp.id)}</option>
              ))}
            </select>
          </label>
        )}

        <div className="piece-command-actions" style={{ marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
          {(
            [
              ["unassigned", "Unassigned"],
              ...(focusedWorkPackageId ? [["package", "This package"] as const] : []),
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`cmd-btn ${scopeFilter === value ? "cmd-btn--primary" : "cmd-btn--ghost"}`}
              onClick={() => setScopeFilter(value)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className={`cmd-btn ${needsDrawingOnly ? "cmd-btn--primary" : "cmd-btn--ghost"}`}
            onClick={() => setNeedsDrawingOnly((v) => !v)}
            title="Only pieces with no drawing set linked"
          >
            Needs drawing
          </button>
          <label className="piece-command-field" htmlFor="piece-mark-filter" style={{ flex: 1, minWidth: 140 }}>
            Mark search
            <input
              id="piece-mark-filter"
              className="piece-command-control"
              value={markFilter}
              onChange={(event) => setMarkFilter(event.target.value)}
              placeholder="Filter by mark…"
            />
          </label>
        </div>

        <div className="piece-command-actions" style={{ marginTop: 0, marginBottom: 8 }}>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={selectablePieces.length === 0 || allVisibleSelected}
            onClick={selectAllVisible}
          >
            Select all visible ({selectablePieces.length})
          </button>
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={selectedPieceIds.size === 0}
            onClick={clearSelection}
          >
            Clear
          </button>
        </div>

        {selectedPieceIds.size > 0 && (
          <div className="piece-selection-bar piece-selection-bar--bulk" style={{ marginBottom: 8 }}>
            <div className="piece-production-bulkbar__meta">
              <Pill tone="info">
                {selectedTons.selected} selected
                {selectedTons.known > 0
                  ? ` · ${selectedTons.tons.toFixed(2)} t`
                  : ""}
              </Pill>
            </div>
            <div className="piece-bulk-group">
              <button
                type="button"
                disabled={
                  !(focusedWorkPackageId || targetWorkPackageId) || assignMutation.isPending
                }
                onClick={runAssign}
                className="cmd-btn cmd-btn--primary"
              >
                {focusedWorkPackageId ? "Add to this WP" : "Assign to WP"}
              </button>
              <button
                type="button"
                disabled={unassignMutation.isPending}
                onClick={() => unassignMutation.mutate()}
                className="cmd-btn cmd-btn--ghost"
              >
                Unassign
              </button>
              {activeDrawingSets.length > 0 && (
                <>
                  <label className="piece-command-field" htmlFor="piece-bulk-drawing-set" style={{ marginTop: 0 }}>
                    Drawing set
                    <select
                      id="piece-bulk-drawing-set"
                      value={drawingSetId}
                      onChange={(event) => setDrawingSetId(event.target.value)}
                      className="piece-command-control"
                    >
                      <option value="">Select set…</option>
                      {filteredDrawingSets.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.set_name || set.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!drawingSetId || bulkLinkMutation.isPending}
                    onClick={() => bulkLinkMutation.mutate()}
                    className="cmd-btn cmd-btn--primary"
                  >
                    Link set to {selectedPieceIds.size}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="piece-assignment-list">
          {selectablePieces.map((piece) => {
            const linkCount = drawingLinkCountByPiece.get(piece.id) ?? 0;
            return (
              <label
                key={piece.id}
                className="piece-assignment-row"
                htmlFor={`piece-assignment-${piece.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  if (event.shiftKey && selectionAnchorId) {
                    const orderedIds = selectablePieces.map((row) => row.id);
                    const rangeIds = selectIdRange(
                      orderedIds,
                      selectionAnchorId,
                      piece.id,
                    );
                    setSelectedPieceIds((current) =>
                      addIdsToSelection(current, rangeIds),
                    );
                    return;
                  }
                  setSelectedPieceIds((current) => {
                    const next = new Set(current);
                    if (next.has(piece.id)) next.delete(piece.id);
                    else next.add(piece.id);
                    return next;
                  });
                  setSelectionAnchorId(piece.id);
                }}
              >
                <input
                  id={`piece-assignment-${piece.id}`}
                  type="checkbox"
                  checked={selectedPieceIds.has(piece.id)}
                  readOnly
                  tabIndex={-1}
                />
                <strong>{piece.piece_mark}</strong>
                <span className="piece-assignment-row__lot">
                  Lot {piece.lot_code}
                  {" · "}
                  {linkCount > 0 ? `${linkCount} drawing set${linkCount === 1 ? "" : "s"}` : "No drawings"}
                </span>
                <span className="piece-assignment-row__package">
                  {liveWorkPackageId(piece)
                    ? workPackageMap.get(liveWorkPackageId(piece)!) ?? "Assigned"
                    : "Unassigned"}
                </span>
              </label>
            );
          })}
          {selectablePieces.length === 0 && (
            <p className="piece-command-empty">
              {focusedWorkPackageId && scopeFilter === "unassigned"
                ? "No unassigned pieces — switch to “This package” or clear filters."
                : needsDrawingOnly
                  ? "Every visible piece already has a drawing set."
                  : focusedWorkPackageId
                    ? "No pieces assigned — add from unassigned marks."
                    : "No active pieces match this filter."}
            </p>
          )}
        </div>
        <div className="piece-command-actions">
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            disabled={packageScopedLeaves.length === 0 || autoAssignMutation.isPending}
            onClick={() => {
              const plan = buildAutoAssignPlan(autoAssignReassign);
              setAutoAssignPlan(plan);
            }}
          >
            <Sparkles size={14} aria-hidden="true" />
            {" "}Auto-assign by import / sequence
          </button>
        </div>

        {autoAssignPlan && (
          <div className="piece-command-empty piece-command-empty--detail" style={{ marginTop: 12 }}>
            <p>
              <strong>Auto-assign preview</strong>
              {" — "}
              matches import filename to work package name first, then sequence / area.
              Ambiguous matches are skipped.
            </p>
            <p>
              <Pill tone="info">{autoAssignPlan.assignments.length} to assign</Pill>
              {" "}
              <Pill tone="neutral">{autoAssignPlan.skipped.length} skipped</Pill>
            </p>
            {autoAssignPlan.assignments.length === 0 && (
              <p>
                No confident matches. Pieces need an import filename that lines up with a
                work package name (e.g. “Anchor Bolt” → WP Anchor Bolts), or matching
                sequence / area fields on both sides.
              </p>
            )}
            {autoAssignSkipSummary && Object.keys(autoAssignSkipSummary).length > 0 && (
              <ul className="piece-readiness-card__blockers">
                {Object.entries(autoAssignSkipSummary).map(([reason, count]) => (
                  <li key={reason}>{reason.replace(/_/g, " ")}: {count}</li>
                ))}
              </ul>
            )}
            {autoAssignPlan.assignments.length > 0 && (
              <ul className="piece-readiness-card__blockers">
                {autoAssignPlan.assignments.slice(0, 12).map((row) => (
                  <li key={row.pieceId}>
                    {row.mark} → {workPackageMap.get(row.workPackageId) ?? row.wpNumber ?? row.workPackageId}
                    {" "}({row.matchReason.replace(/_/g, " ")})
                  </li>
                ))}
                {autoAssignPlan.assignments.length > 12 && (
                  <li>…and {autoAssignPlan.assignments.length - 12} more</li>
                )}
              </ul>
            )}
            <label className="piece-command-field" htmlFor="auto-assign-reassign" style={{ marginTop: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  id="auto-assign-reassign"
                  type="checkbox"
                  checked={autoAssignReassign}
                  onChange={(event) => {
                    const next = event.target.checked;
                    setAutoAssignReassign(next);
                    setAutoAssignPlan(buildAutoAssignPlan(next));
                  }}
                />
                Include pieces already assigned to another work package
              </span>
            </label>
            <div className="piece-command-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="cmd-btn cmd-btn--primary"
                disabled={
                  autoAssignPlan.assignments.length === 0 || autoAssignMutation.isPending
                }
                onClick={() => {
                  autoAssignMutation.mutate(autoAssignPlan);
                }}
              >
                Confirm auto-assign
              </button>
              <button
                type="button"
                className="cmd-btn cmd-btn--ghost"
                disabled={autoAssignMutation.isPending}
                onClick={() => setAutoAssignPlan(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </DecisionPanel>

      <DecisionPanel title="Piece and drawing set links">
        <div className="piece-command-intro">
          <span className="piece-command-intro__icon" aria-hidden="true">
            <Link2 size={18} />
          </span>
          <p>
            Select pieces on the left (or use <strong>Needs drawing</strong>), pick a set,
            then link in bulk from the selection bar. Review links for one piece below.
          </p>
        </div>
        {drawingPieces.length === 0 || activeDrawingSets.length === 0 ? (
          <div className="piece-command-empty piece-command-empty--detail">
            {drawingPieces.length === 0 && (
              <p>
                {focusedWorkPackageId
                  ? "Assign active pieces to this work package before linking drawing sets."
                  : "Import or add active pieces to the Piece Register before linking drawing sets."}
              </p>
            )}
            {activeDrawingSets.length === 0 && (
              <p>Add active project drawing sets before creating piece links.</p>
            )}
          </div>
        ) : (
          <>
            <label className="piece-command-field" htmlFor="piece-drawing-set-filter">
              Drawing set search
              <input
                id="piece-drawing-set-filter"
                className="piece-command-control"
                value={drawingFilter}
                onChange={(event) => setDrawingFilter(event.target.value)}
                placeholder="Filter by set name…"
              />
            </label>
            <div className="piece-link-controls">
              <label className="piece-command-field" htmlFor="piece-drawing-link-piece">
                Inspect piece
                <select
                  id="piece-drawing-link-piece"
                  value={selectedDrawingPieceId}
                  onChange={(event) => setDrawingPieceId(event.target.value)}
                  className="piece-command-control"
                >
                  {drawingPieces.map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      {piece.piece_mark} · {piece.lot_code}
                      {(drawingLinkCountByPiece.get(piece.id) ?? 0) > 0
                        ? ` (${drawingLinkCountByPiece.get(piece.id)} sets)`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="piece-command-field" htmlFor="piece-drawing-link-set">
                Drawing set
                <select
                  id="piece-drawing-link-set"
                  value={drawingSetId}
                  onChange={(event) => setDrawingSetId(event.target.value)}
                  className="piece-command-control"
                >
                  <option value="">Select drawing set</option>
                  {filteredDrawingSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.set_name || set.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="piece-command-actions" style={{ flexWrap: "wrap", gap: 6 }}>
              <button
                type="button"
                disabled={
                  selectedPieceIds.size === 0 ||
                  !drawingSetId ||
                  bulkLinkMutation.isPending
                }
                onClick={() => bulkLinkMutation.mutate()}
                className="cmd-btn cmd-btn--primary piece-link-action"
              >
                {selectedPieceIds.size > 0
                  ? `Link set to ${selectedPieceIds.size} selected`
                  : "Link set to selected"}
              </button>
              <button
                type="button"
                disabled={
                  !selectedDrawingPieceId || !drawingSetId || linkMutation.isPending
                }
                onClick={() => linkMutation.mutate()}
                className="cmd-btn cmd-btn--ghost piece-link-action"
              >
                Link inspect piece only
              </button>
            </div>
          </>
        )}
        <div className="piece-link-list">
          {linksForPiece.map((link) => {
            const set = drawingSetMap.get(link.drawing_set_id);
            return (
              <div key={link.drawing_set_id} className="piece-link-row">
                <strong>{set?.set_name || link.drawing_set_id}</strong>
                <span>Drawing set</span>
                <button
                  type="button"
                  aria-label="Unlink drawing set"
                  onClick={() =>
                    unlinkMutation.mutate({
                      pieceId: link.piece_id,
                      targetDrawingSetId: link.drawing_set_id,
                    })
                  }
                  className="piece-link-row__unlink"
                >
                  <Unlink2 size={16} />
                </button>
              </div>
            );
          })}
          {selectedDrawingPieceId && linksForPiece.length === 0 && (
            <p className="piece-command-empty">No drawing sets linked to this piece.</p>
          )}
        </div>
      </DecisionPanel>

      <DecisionPanel title="Work package readiness">
        <p className="piece-readiness-notice">
          Read-only readiness check. Work package status is not changed.
        </p>
        <div className="piece-readiness-grid">
          {visibleReadiness.map((row) => (
            <article
              key={row.workPackageId}
              className={`piece-readiness-card${row.isReady ? " is-ready" : " is-blocked"}`}
            >
              <div className="piece-readiness-card__head">
                <div>
                  <strong>{workPackageMap.get(row.workPackageId)}</strong>
                  <span>
                    {row.pieceCount} pieces · {row.approvedDrawingCount}/{row.linkedDrawingCount} drawings IFC/Released
                  </span>
                </div>
                {row.isReady
                  ? <Pill tone="good"><CheckCircle2 size={13} /> Ready</Pill>
                  : <Pill tone="warn"><AlertTriangle size={13} /> Blocked</Pill>}
              </div>
              {row.blockers.length === 0 ? (
                <p className="piece-readiness-card__success">No piece or drawing blockers found.</p>
              ) : (
                <ul className="piece-readiness-card__blockers">
                  {row.blockers.map((blocker) => (
                    <li key={blocker}>{READINESS_BLOCKER_COPY[blocker] ?? blocker}</li>
                  ))}
                </ul>
              )}
              <div className="piece-readiness-card__material">
                {READINESS_MATERIAL_COPY[row.materialState] ??
                  `Material: ${row.materialState}`}
              </div>
            </article>
          ))}
          {visibleReadiness.length === 0 && (
            <p className="piece-command-empty">No active work packages in this view.</p>
          )}
        </div>
      </DecisionPanel>
    </div>
  );
}
