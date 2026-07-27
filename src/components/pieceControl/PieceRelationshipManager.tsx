import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, PackageCheck, Unlink2 } from "lucide-react";
import { toast } from "sonner";
import "@/styles/piece-control-command.css";
import { DecisionPanel, Pill } from "@/components/command";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { evaluateWorkPackageReadiness } from "@/lib/pieceControl/readiness";
import {
  assignPiecesToWorkPackage,
  fetchPieceRelationshipSnapshot,
  linkPieceDrawing,
  unassignPiecesFromWorkPackage,
  unlinkPieceDrawing,
} from "@/lib/pieceControl/relationshipsRepository";
import { presentPieceControlError } from "@/lib/pieceControl/errorPresentation";

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
  const [drawingId, setDrawingId] = useState("");
  const [markFilter, setMarkFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"unassigned" | "package" | "all">(
    focusedWorkPackageId ? "unassigned" : "all",
  );

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
  const packageScopedLeaves = focusedWorkPackageId
    ? leafPieces.filter((piece) =>
      !piece.work_package_id || piece.work_package_id === focusedWorkPackageId
    )
    : leafPieces;

  const selectablePieces = useMemo(() => {
    const mark = markFilter.trim().toLowerCase();
    return packageScopedLeaves.filter((piece) => {
      if (scopeFilter === "unassigned" && piece.work_package_id) return false;
      if (
        scopeFilter === "package" &&
        focusedWorkPackageId &&
        piece.work_package_id !== focusedWorkPackageId
      ) {
        return false;
      }
      if (mark && !String(piece.piece_mark || "").toLowerCase().includes(mark)) {
        return false;
      }
      return true;
    });
  }, [focusedWorkPackageId, markFilter, packageScopedLeaves, scopeFilter]);

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

  const drawingPieces = focusedWorkPackageId
    ? leafPieces.filter((piece) => piece.work_package_id === focusedWorkPackageId)
    : leafPieces;

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
    );
  }, [snapshot]);
  const visibleReadiness = focusedWorkPackageId
    ? readiness.filter((row) => row.workPackageId === focusedWorkPackageId)
    : readiness;
  const selectedDrawingPieceId = drawingPieceId || drawingPieces[0]?.id || "";
  const linksForPiece = (snapshot?.pieceDrawings ?? []).filter(
    (link) => link.piece_id === selectedDrawingPieceId,
  );
  const drawingMap = new Map((snapshot?.drawings ?? []).map((drawing) => [drawing.id, drawing]));
  const workPackageMap = new Map(
    (snapshot?.workPackages ?? []).map((wp) => [wp.id, wp.wp_number || wp.name || "Unnamed package"]),
  );

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
    mutationFn: () => linkPieceDrawing(projectId, selectedDrawingPieceId, drawingId),
    ...mutationOptions,
    onSuccess: async (summary) => {
      setDrawingId("");
      await mutationOptions.onSuccess();
      toast.success(summary.linked ? "Drawing linked" : "Drawing was already linked");
    },
  });
  const unlinkMutation = useMutation({
    mutationFn: ({ pieceId, targetDrawingId }: { pieceId: string; targetDrawingId: string }) =>
      unlinkPieceDrawing(projectId, pieceId, targetDrawingId),
    ...mutationOptions,
    onSuccess: async (summary) => {
      await mutationOptions.onSuccess();
      toast.success(summary.unlinked ? "Drawing unlinked" : "Drawing link was already absent");
    },
  });

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
            {focusedWorkPackageId
              ? "Add unassigned piece marks to this work package, or remove assigned lots."
              : "Multi-select piece marks and assign them to a work package."}
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

        {selectedPieceIds.size > 0 && (
          <p className="piece-command-intro" style={{ marginBottom: 8 }}>
            <Pill tone="info">
              {selectedTons.selected} selected
              {selectedTons.known > 0
                ? ` · ${selectedTons.tons.toFixed(2)} t (${selectedTons.known} weighed)`
                : ""}
            </Pill>
          </p>
        )}

        <div className="piece-assignment-list">
          {selectablePieces.map((piece) => (
            <label
              key={piece.id}
              className="piece-assignment-row"
              htmlFor={`piece-assignment-${piece.id}`}
            >
              <input
                id={`piece-assignment-${piece.id}`}
                type="checkbox"
                checked={selectedPieceIds.has(piece.id)}
                onChange={(event) => setSelectedPieceIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(piece.id);
                  else next.delete(piece.id);
                  return next;
                })}
              />
              <strong>{piece.piece_mark}</strong>
              <span className="piece-assignment-row__lot">Lot {piece.lot_code}</span>
              <span className="piece-assignment-row__package">
                {piece.work_package_id ? workPackageMap.get(piece.work_package_id) ?? "Assigned" : "Unassigned"}
              </span>
            </label>
          ))}
          {selectablePieces.length === 0 && (
            <p className="piece-command-empty">
              {focusedWorkPackageId && scopeFilter === "unassigned"
                ? "No unassigned pieces — switch to “This package” or clear the mark filter."
                : focusedWorkPackageId
                  ? "No pieces assigned — add from unassigned marks."
                  : "No active pieces match this filter."}
            </p>
          )}
        </div>
        <div className="piece-command-actions">
          <button
            type="button"
            disabled={selectedPieceIds.size === 0 || !(focusedWorkPackageId || targetWorkPackageId) || assignMutation.isPending}
            onClick={() => {
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
            }}
            className="cmd-btn cmd-btn--primary"
          >
            {focusedWorkPackageId ? "Add to this WP" : "Assign selected"}
          </button>
          <button
            type="button"
            disabled={selectedPieceIds.size === 0 || unassignMutation.isPending}
            onClick={() => unassignMutation.mutate()}
            className="cmd-btn cmd-btn--ghost"
          >
            {focusedWorkPackageId ? "Remove from WP" : "Unassign selected"}
          </button>
        </div>
      </DecisionPanel>

      <DecisionPanel title="Piece and drawing links">
        <div className="piece-command-intro">
          <span className="piece-command-intro__icon" aria-hidden="true">
            <Link2 size={18} />
          </span>
          <p>Create explicit links between piece lots and drawings.</p>
        </div>
        {drawingPieces.length === 0 || snapshot.drawings.length === 0 ? (
          <div className="piece-command-empty piece-command-empty--detail">
            {drawingPieces.length === 0 && (
              <p>
                {focusedWorkPackageId
                  ? "Assign active pieces to this work package before linking drawings."
                  : "Import or add active pieces to the Piece Register before linking drawings."}
              </p>
            )}
            {snapshot.drawings.length === 0 && (
              <p>Add active project drawings before creating piece links.</p>
            )}
          </div>
        ) : (
          <>
            <div className="piece-link-controls">
              <label className="piece-command-field" htmlFor="piece-drawing-link-piece">
                Piece
                <select
                  id="piece-drawing-link-piece"
                  value={selectedDrawingPieceId}
                  onChange={(event) => setDrawingPieceId(event.target.value)}
                  className="piece-command-control"
                >
                  {drawingPieces.map((piece) => (
                    <option key={piece.id} value={piece.id}>
                      {piece.piece_mark} · {piece.lot_code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="piece-command-field" htmlFor="piece-drawing-link-drawing">
                Drawing
                <select
                  id="piece-drawing-link-drawing"
                  value={drawingId}
                  onChange={(event) => setDrawingId(event.target.value)}
                  className="piece-command-control"
                >
                  <option value="">Select drawing</option>
                  {snapshot.drawings.map((drawing) => (
                    <option key={drawing.id} value={drawing.id}>
                      {drawing.sheet_number || drawing.id} · {drawing.title || "Untitled"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              disabled={!selectedDrawingPieceId || !drawingId || linkMutation.isPending}
              onClick={() => linkMutation.mutate()}
              className="cmd-btn cmd-btn--primary piece-link-action"
            >
              Link drawing
            </button>
          </>
        )}
        <div className="piece-link-list">
          {linksForPiece.map((link) => {
            const drawing = drawingMap.get(link.drawing_id);
            return (
              <div key={link.drawing_id} className="piece-link-row">
                <strong>{drawing?.sheet_number || link.drawing_id}</strong>
                <span>{drawing?.title || "Inactive drawing"}</span>
                <button
                  type="button"
                  aria-label="Unlink drawing"
                  onClick={() => unlinkMutation.mutate({ pieceId: link.piece_id, targetDrawingId: link.drawing_id })}
                  className="piece-link-row__unlink"
                >
                  <Unlink2 size={16} />
                </button>
              </div>
            );
          })}
          {selectedDrawingPieceId && linksForPiece.length === 0 && (
            <p className="piece-command-empty">No drawings linked to this piece.</p>
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
