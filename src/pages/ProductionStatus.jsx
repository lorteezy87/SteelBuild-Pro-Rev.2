/**
 * ProductionStatus.jsx — per-piece fabrication status imported from Tekla EPM /
 * FabSuite (Phase 4). Answers the shop-floor questions "what's fabricated?" /
 * "what's ready to ship / erect?" from production-control exports.
 *
 * ProductionStatusControlCenter is the canonical presentation. This page owns
 * the project-scoped reads, import modal state, and cache invalidation.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { useProjectContext } from "@/components/shared/ProjectContext";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { listPieceProduction } from "@/lib/production/repository";
import {
  fetchAllModelElements,
  MODEL_ELEMENT_DRAWING_LINK_COLUMNS,
} from "@/lib/ifc/fetchAllModelElements";
import { buildPieceDrawingMap } from "@/lib/production/pieceDrawingLinks";
import { normalizePieceMark } from "@/services/modelElementStatus";
import ProductionStatusImportModal from "@/components/production/ProductionStatusImportModal";
import TeklaEpmImportModal from "@/components/production/TeklaEpmImportModal";
import ProductionStatusControlCenter from "./productionStatus/ProductionStatusControlCenter";

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

  const { data: pieces = [], isLoading } = useQuery({
    queryKey: ["piece-production", projectId],
    queryFn: () => listPieceProduction(projectId),
    enabled: !!projectId,
    staleTime: 30_000,
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

  const drawingCoverage = useMemo(() => {
    const total = filtered.length;
    if (!total) return { total: 0, linked: 0, pct: 0 };
    let linked = 0;
    for (const p of filtered) {
      if (pieceDrawingMap.has(normalizePieceMark(p.piece_mark))) linked += 1;
    }
    return { total, linked, pct: Math.round((linked / total) * 100) };
  }, [filtered, pieceDrawingMap]);

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
        onImported={() => queryClient.invalidateQueries({ queryKey: ["piece-production", projectId] })}
      />
      <TeklaEpmImportModal
        open={showEpmImport}
        projectId={projectId}
        projectName={activeProject?.name}
        onClose={() => setShowEpmImport(false)}
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
      />
      {modals}
    </div>
  );
}
