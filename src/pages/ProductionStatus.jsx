/**
 * ProductionStatus.jsx — per-piece fabrication status imported from Tekla EPM /
 * FabSuite (Phase 4). Answers the shop-floor questions "what's fabricated?" /
 * "what's ready to ship / erect?" from production-control exports.
 *
 * ProductionStatusControlCenter is the canonical presentation. This page owns
 * the project-scoped reads, import modal state, selection, and cache invalidation.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { supabase } from "@/lib/supabase";
import {
  bulkUpdateProductionStage,
  listPieceProduction,
} from "@/lib/production/repository";
import {
  fetchAllModelElements,
  MODEL_ELEMENT_DRAWING_LINK_COLUMNS,
} from "@/lib/ifc/fetchAllModelElements";
import { buildPieceDrawingMap } from "@/lib/production/pieceDrawingLinks";
import { normalizePieceMark } from "@/services/modelElementStatus";
import ProductionStatusImportModal from "@/components/production/ProductionStatusImportModal";
import TeklaEpmImportModal from "@/components/production/TeklaEpmImportModal";
import ProductionStatusControlCenter from "./productionStatus/ProductionStatusControlCenter";
import {
  invalidatePieceControlQueries,
  pieceControlKeys,
} from "@/lib/pieceControl/queryKeys";

/** CSV export — reuses the same field order as the control-center columns. */
function exportProductionCSV(rows) {
  const headers = ["Piece Mark", "Assembly", "Seq", "Area", "Stage", "% Complete", "Qty", "Ship Date", "Weight", "External Ref"];
  const data = rows.map((p) => [
    p.piece_mark,
    p.assembly_mark || "",
    p.sequence_number || "",
    p.erection_area || "",
    p.status || "",
    p.percent_complete ?? "",
    p.quantity ?? "",
    p.ship_date || "",
    p.weight ?? "",
    p.external_ref || "",
  ]);
  const csv = [headers, ...data]
    .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "production-status.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProductionStatus() {
  const projectId = useProjectId();
  const { activeProject } = useProjectContext();
  const queryClient = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [showEpmImport, setShowEpmImport] = useState(false);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  // Multi-user: when another session writes piece_production (import / station
  // update), refresh this page's list without a hard reload. Debounced 300ms
  // inside the hook so bulk imports don't thrash.
  useRealtimeInvalidation("piece_production", projectId, [
    pieceControlKeys.legacyProduction(projectId),
  ]);

  const { data: pieces = [], isLoading } = useQuery({
    queryKey: pieceControlKeys.legacyProduction(projectId),
    queryFn: () => listPieceProduction(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Count-only probe of the canonical Piece Register so an empty shop import
  // can be explained ("register has N pieces, this feed has none") instead of
  // reading as "this project has no pieces". head:true → no rows transferred.
  const { data: canonicalPieceCount = 0 } = useQuery({
    queryKey: ["production-canonical-piece-count", projectId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("pieces")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("is_deleted", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

  // piece_production has no drawing column; the mark-to-sheet relationship
  // lives in model_elements and is reduced to a project-scoped lookup map.
  const { data: modelElements = [] } = useQuery({
    queryKey: ["production-model-elements", projectId],
    // Slim columns + bounded concurrency — full SELECT * pages were timing out
    // on ~27k-row projects (Sentry JAVASCRIPT-REACT-X).
    queryFn: () =>
      fetchAllModelElements(projectId, { columns: MODEL_ELEMENT_DRAWING_LINK_COLUMNS }),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });

  const pieceDrawingMap = useMemo(
    () => buildPieceDrawingMap(modelElements),
    [modelElements],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pieces.filter((p) => {
      if (stageFilter !== "All" && p.status !== stageFilter) return false;
      if (!q) return true;
      return (
        (p.piece_mark || "").toLowerCase().includes(q) ||
        (p.assembly_mark || "").toLowerCase().includes(q) ||
        (p.erection_area || "").toLowerCase().includes(q) ||
        (p.sequence_number || "").toLowerCase().includes(q)
      );
    });
  }, [pieces, search, stageFilter]);

  // Drop selection when the visible set changes so bulk actions only hit current filters.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [search, stageFilter, projectId]);

  const drawingCoverage = useMemo(() => {
    const total = filtered.length;
    if (!total) return { total: 0, linked: 0, pct: 0 };
    let linked = 0;
    for (const p of filtered) {
      if (pieceDrawingMap.has(normalizePieceMark(p.piece_mark))) linked += 1;
    }
    return { total, linked, pct: Math.round((linked / total) * 100) };
  }, [filtered, pieceDrawingMap]);

  const bulkStageMutation = useMutation({
    mutationFn: (stage) =>
      bulkUpdateProductionStage(projectId, Array.from(selectedIds), stage),
    onSuccess: async (result, stage) => {
      toast.success(
        `Set ${result.updated} piece${result.updated === 1 ? "" : "s"} to ${stage}.`,
      );
      setSelectedIds(new Set());
      await invalidatePieceControlQueries(queryClient, projectId, "production");
    },
    onError: (error) => {
      toast.error(error?.message || "Bulk stage update failed.");
    },
  });

  const onToggleRow = (id, next) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (next) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const onToggleAll = (selectAll) => {
    if (!selectAll) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((p) => p.id).filter(Boolean)));
  };

  /** After CSV production-status import: bridge already wrote fab_status/lifecycle; refresh caches. */
  const handleProductionImported = async () => {
    await Promise.all([
      // Shared helper: production board + logistics + legacyProduction + model-elements +
      // canonical-pieces-3d + reporting (Fab-mode colors). legacyProduction is included
      // in the production scope after #193 — no separate invalidate needed.
      invalidatePieceControlQueries(queryClient, projectId, "production"),
      // Drawing-link map used by this page only (also covered when model_element
      // is invalidated via cacheRegistry, but keep explicit for CSV path clarity).
      queryClient.invalidateQueries({
        queryKey: ["production-model-elements", projectId],
      }),
    ]);
  };

  /** After Tekla EPM XML (BOM → model_elements): refresh drawing-link map on this page.
   *  invalidateEntity inside the modal already covers model-elements + production-model-elements
   *  via cacheRegistry; this is a focused page-local refresh so Shop Dwg updates immediately. */
  const handleTeklaEpmImported = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["production-model-elements", projectId],
    });
  };

  if (!projectId) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)" }}>
        Pick a project from the top bar to view fabrication status.
      </div>
    );
  }

  const modals = (
    <>
      <ProductionStatusImportModal
        open={showImport}
        projectId={projectId}
        projectName={activeProject?.name}
        existing={pieces}
        onClose={() => setShowImport(false)}
        onImported={handleProductionImported}
      />
      <TeklaEpmImportModal
        open={showEpmImport}
        projectId={projectId}
        projectName={activeProject?.name}
        onClose={() => setShowEpmImport(false)}
        onImported={handleTeklaEpmImported}
      />
    </>
  );

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  return (
    <div className="production-page">
      {/* This page reads the Tekla/FabSuite import table (piece_production).
          The canonical Piece Register is a different model, so a project with
          a populated register showed a bare "0 pieces" here — which reads as
          "no work exists" rather than "nothing has been imported yet". */}
      {pieces.length === 0 && canonicalPieceCount > 0 && (
        <div
          style={{
            margin: "12px 24px 0",
            padding: "12px 16px",
            borderRadius: 8,
            border: "1px solid var(--warning-border)",
            background: "var(--warning-muted)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--text-secondary)",
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: "var(--text-primary)" }}>
            No shop import for this project yet.
          </strong>{" "}
          The Piece Register has {canonicalPieceCount} piece
          {canonicalPieceCount === 1 ? "" : "s"}, but this page tracks per-piece
          status imported from Tekla EPM / FabSuite — a separate feed. Import a
          production file to populate it; the register is unaffected.
        </div>
      )}
      <ProductionStatusControlCenter
        projectName={activeProject?.name || "All Projects"}
        pieces={pieces}
        filtered={filtered}
        search={search}
        onSearch={setSearch}
        stageFilter={stageFilter}
        onStageFilterChange={setStageFilter}
        onExport={() => exportProductionCSV(filtered)}
        onImport={() => setShowImport(true)}
        onImportEpm={() => setShowEpmImport(true)}
        pieceDrawingMap={pieceDrawingMap}
        drawingCoverage={drawingCoverage}
        projectHealth={activeProject?.health_status || null}
        percentComplete={activeProject?.scope_complete_pct_override != null ? Number(activeProject.scope_complete_pct_override) : null}
        selectedIds={selectedIds}
        onToggleRow={onToggleRow}
        onToggleAll={onToggleAll}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkSetStage={(stage) => bulkStageMutation.mutate(stage)}
        bulkPending={bulkStageMutation.isPending}
      />
      {modals}
    </div>
  );
}
