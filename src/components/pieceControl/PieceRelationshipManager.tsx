import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Link2, PackageCheck, Unlink2 } from "lucide-react";
import { toast } from "sonner";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { evaluateWorkPackageReadiness } from "@/lib/pieceControl/readiness";
import {
  assignPiecesToWorkPackage,
  fetchPieceRelationshipSnapshot,
  linkPieceDrawing,
  unassignPiecesFromWorkPackage,
  unlinkPieceDrawing,
} from "@/lib/pieceControl/relationshipsRepository";

interface PieceRelationshipManagerProps {
  projectId: string;
  pieceControlMode?: string;
  focusedWorkPackageId?: string;
  compact?: boolean;
}

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
  const selectablePieces = focusedWorkPackageId
    ? leafPieces.filter((piece) =>
      !piece.work_package_id || piece.work_package_id === focusedWorkPackageId
    )
    : leafPieces;
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
    ]);
  };
  const mutationOptions = {
    onSuccess: async () => {
      setSelectedPieceIds(new Set());
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Piece relationship update failed"),
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
      toast.success(`${summary.assigned ?? 0} piece relationship(s) assigned`);
    },
  });
  const unassignMutation = useMutation({
    mutationFn: () => unassignPiecesFromWorkPackage(projectId, [...selectedPieceIds]),
    ...mutationOptions,
    onSuccess: async (summary) => {
      await mutationOptions.onSuccess();
      toast.success(`${summary.unassigned ?? 0} piece relationship(s) removed`);
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
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <div className="flex items-center gap-2 font-black">
          <AlertTriangle className="h-4 w-4" />
          Piece relationship controls are disabled
        </div>
        <p className="mt-1">Enable piece control for this project to manage authoritative scope.</p>
      </div>
    );
  }

  if (snapshotQuery.isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading piece relationships…</div>;
  }

  if (snapshotQuery.error || !snapshot) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Unable to load piece relationships.</div>;
  }

  return (
    <div className={`grid gap-4 ${compact ? "" : "xl:grid-cols-[1.1fr_0.9fr]"}`}>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <PackageCheck className="h-5 w-5 text-amber-700" />
          <div>
            <h3 className="font-black text-slate-950">Authoritative piece scope</h3>
            <p className="text-xs text-slate-500">Assignments update only pieces.work_package_id.</p>
          </div>
        </div>

        {!focusedWorkPackageId && (
          <label className="mt-4 grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Target work package
            <select value={targetWorkPackageId} onChange={(event) => setTargetWorkPackageId(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
              <option value="">Select package</option>
              {snapshot.workPackages.map((wp) => <option key={wp.id} value={wp.id}>{workPackageMap.get(wp.id)}</option>)}
            </select>
          </label>
        )}

        <div className="mt-4 max-h-52 overflow-auto rounded-xl border border-slate-200">
          {selectablePieces.map((piece) => (
            <label key={piece.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={selectedPieceIds.has(piece.id)}
                onChange={(event) => setSelectedPieceIds((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(piece.id);
                  else next.delete(piece.id);
                  return next;
                })}
              />
              <span className="font-black text-slate-900">{piece.piece_mark}</span>
              <span className="text-xs text-slate-500">Lot {piece.lot_code}</span>
              <span className="ml-auto text-xs text-slate-500">
                {piece.work_package_id ? workPackageMap.get(piece.work_package_id) ?? "Assigned" : "Unassigned"}
              </span>
            </label>
          ))}
          {selectablePieces.length === 0 && <p className="p-5 text-center text-sm text-slate-500">No active leaf pieces available.</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={selectedPieceIds.size === 0 || !(focusedWorkPackageId || targetWorkPackageId) || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
          >
            Assign selected
          </button>
          <button
            disabled={selectedPieceIds.size === 0 || unassignMutation.isPending}
            onClick={() => unassignMutation.mutate()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40"
          >
            Unassign selected
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-amber-700" />
          <div>
            <h3 className="font-black text-slate-950">Piece-to-drawing links</h3>
            <p className="text-xs text-slate-500">Explicit links; legacy model-element links remain unchanged.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Piece
            <select value={selectedDrawingPieceId} onChange={(event) => setDrawingPieceId(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
              {drawingPieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.piece_mark} · {piece.lot_code}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Drawing
            <select value={drawingId} onChange={(event) => setDrawingId(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-sm normal-case tracking-normal">
              <option value="">Select drawing</option>
              {snapshot.drawings.map((drawing) => <option key={drawing.id} value={drawing.id}>{drawing.sheet_number || drawing.id} · {drawing.title || "Untitled"}</option>)}
            </select>
          </label>
        </div>
        <button
          disabled={!selectedDrawingPieceId || !drawingId || linkMutation.isPending}
          onClick={() => linkMutation.mutate()}
          className="mt-3 rounded-lg bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-40"
        >
          Link drawing
        </button>
        <div className="mt-4 space-y-2">
          {linksForPiece.map((link) => {
            const drawing = drawingMap.get(link.drawing_id);
            return (
              <div key={link.drawing_id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="font-black">{drawing?.sheet_number || link.drawing_id}</span>
                <span className="truncate text-slate-500">{drawing?.title || "Inactive drawing"}</span>
                <button
                  aria-label="Unlink drawing"
                  onClick={() => unlinkMutation.mutate({ pieceId: link.piece_id, targetDrawingId: link.drawing_id })}
                  className="ml-auto rounded p-1 text-rose-700 hover:bg-rose-50"
                >
                  <Unlink2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          {selectedDrawingPieceId && linksForPiece.length === 0 && <p className="py-3 text-center text-sm text-slate-500">No drawings linked to this piece.</p>}
        </div>
      </div>

      <div className={`rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-sm ${compact ? "" : "xl:col-span-2"}`}>
        <h3 className="font-black">Derived readiness</h3>
        <p className="mt-1 text-xs text-slate-400">Read-only evaluation. Work package status is not changed.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleReadiness.map((row) => (
            <div key={row.workPackageId} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-black">{workPackageMap.get(row.workPackageId)}</div>
                  <div className="mt-1 text-xs text-slate-400">{row.pieceCount} pieces · {row.approvedDrawingCount}/{row.linkedDrawingCount} drawings approved</div>
                </div>
                {row.isReady
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  : <AlertTriangle className="h-5 w-5 text-amber-400" />}
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {row.blockers.length === 0
                  ? <p className="text-emerald-300">No piece or drawing blockers found.</p>
                  : row.blockers.map((blocker) => <p key={blocker} className="text-amber-200">• {blocker}</p>)}
              </div>
              <div className="mt-3 border-t border-white/10 pt-3 text-xs text-slate-400">
                Material: {row.materialState}
              </div>
            </div>
          ))}
          {visibleReadiness.length === 0 && <p className="text-sm text-slate-400">No active work packages in this view.</p>}
        </div>
      </div>
    </div>
  );
}
