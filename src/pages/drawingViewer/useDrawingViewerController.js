import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { entities, resolveFileUrl } from "@/api/supabaseClient";
import { useDrawingViewerSelection } from "./useDrawingViewerSelection";
import { usePdfLoader } from "./usePdfLoader";
import { usePdfRenderer } from "./pages/drawingViewer/usePdfRenderer"; // Wait, the path is src/pages/drawingViewer/usePdfRenderer
import { useZoneData } from "./useZoneData";
import { useMarkup } from "@/components/drawings/viewer/useMarkup";
import { deriveOverlayViewModel, deriveZonePanelSheet } from "./drawingViewerDerivations";
import { createZone, updateZone, deleteZone, createNewRevisionAndCarryZones, unlockSet } from "@/lib/drawingHub";
import { logActivity } from "@/services/auditLogger";
import { invalidateEntity } from "@/services/cacheRegistry";
import { parseRealDistance, formatScaleFraction } from "@/components/drawings/viewer/scaleParse";

export function useDrawingViewerController(projectId) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id || null)).catch(() => {});
  }, []);

  // View State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [filmstripOpen, setFilmstripOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [renderMode, setRenderMode] = useState("canvas");

  // Markup State
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState("#ff0000"); // Default or from MARKUP_COLORS
  const [activeStamp, setActiveStamp] = useState("APPROVED");
  const [hideResolved, setHideResolved] = useState(false);
  const [exportMarkupOpen, setExportMarkupOpen] = useState(false);

  // Zone State
  const [zoneMode, setZoneMode] = useState("off");
  const [drawShape, setDrawShape] = useState("rect");
  const [zoneOverlay, setZoneOverlay] = useState("status");
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [panelZoneId, setPanelZoneId] = useState(null);
  const [zoneFilter, setZoneFilter] = useState({ statusSet: new Set(), typeKey: "all" });
  const [proposalPanelOpen, setProposalPanelOpen] = useState(false);
  const [hoveredProposal, setHoveredProposal] = useState(null);
  const [showDeps, setShowDeps] = useState(false);

  const {
    drawings,
    filtered,
    activeDrawing,
    activeIndex,
    activeId,
    setActiveId,
    search,
    setSearch,
  } = useDrawingViewerSelection(projectId);

  const markupScale = activeDrawing?.markup_scale || null;

  const {
    resolvedUrl,
    pdfDoc,
    totalPages,
    pdfError,
    currentPage,
    setCurrentPage,
    setPdfError,
  } = usePdfLoader({ activeDrawing, renderMode });

  const {
    canvasRef,
    rendering,
    currentViewport,
    canvasSize,
    pageSize,
    linkHotspots,
  } = usePdfRenderer({ pdfDoc, currentPage, zoom, rotation, onRenderError: setPdfError });

  const {
    currentRevision,
    zones,
    refetchZones,
    pendingProposalCount,
    dependencyEdges,
    zoneSummaries,
    zoneDensities,
    zonesWithComputed,
    zoneStatusCounts,
    filteredZones,
  } = useZoneData({ projectId, activeId, activeDrawing, zoneMode, showDeps, zoneFilter });

  const markup = useMarkup({
    drawingId: activeId,
    projectId,
    drawingRevisionId: currentRevision?.id || null,
  });

  const overlayView = useMemo(() => deriveOverlayViewModel({
    activeDrawing,
    renderMode,
    pdfError,
    markupItems: markup.items,
    currentPage,
    zoneMode,
    zoneCount: zones.length,
    filteredZoneCount: filteredZones.length,
    computedZoneCount: zonesWithComputed.length,
  }), [activeDrawing, renderMode, pdfError, markup.items, currentPage, zoneMode, zones, filteredZones, zonesWithComputed]);

  const zonePanelSheet = useMemo(() => deriveZonePanelSheet(currentRevision, activeDrawing), [currentRevision, activeDrawing]);

  const handleCalibrate = useCallback(async (pdfInches) => {
    if (!activeDrawing?.id) return;
    if (pdfInches <= 0) return;

    const raw = window.prompt(
      `This page measures ${pdfInches.toFixed(2)}" on the PDF.\n\n` +
      `What is the REAL-WORLD distance between the two points?\n` +
      `Accepts: 10'-0, 10'0", 120", 120, 10ft, 10 feet`,
      "",
    );
    if (raw == null) return;
    const realInches = parseRealDistance(raw);
    if (!Number.isFinite(realInches) || realInches <= 0) {
      toast.error(`Could not parse "${raw}" as a distance. Try formats like 10'-0 or 120"`);
      return;
    }
    const scale = realInches / pdfInches;
    try {
      await entities.Drawing.update(activeDrawing.id, { markup_scale: scale });
      qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      toast.success(`Calibrated · 1 page inch = ${scale.toFixed(1)} real inches (${formatScaleFraction(scale)})`);
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    }
  }, [activeDrawing, projectId, qc]);

  const handleNewRevision = useCallback(async () => {
    if (!activeDrawing) return;
    const newCode = window.prompt(
      `New revision code for sheet ${activeDrawing.sheet_number || activeDrawing.drawing_number || "—"}\n(e.g. "B", "1", "IFC-2"):`,
      "",
    );
    if (!newCode || !newCode.trim()) return;
    const carryLinks = window.confirm(
      "Carry the current zone links (RFIs, work packages, etc.) forward too?\n\nOK = yes, copy every active link.\nCancel = no, start fresh on the new revision.",
    );
    try {
      const res = await createNewRevisionAndCarryZones({
        drawing: activeDrawing,
        newCode: newCode.trim(),
        newName: null,
        includeLinks: carryLinks,
      });
      toast.success(`Revision ${res.revision.revision_code} created — ${res.zonesCloned} zones${res.linksClHinked ? ` + ${res.linksCloned} links` : ""} carried forward`);
      qc.invalidateQueries({ queryKey: ["drawing-revision-current"] });
      qc.invalidateQueries({ queryKey: ["drawing-zones"] });
      qc.invalidateQueries({ queryKey: ["drawing-zones-summaries"] });
      invalidateEntity(qc, "drawing_revision", activeDrawing.project_id);
    } catch (err) {
      toast.error(`Couldn't create revision: ${err?.message || "unknown error"}`);
    }
  }, [activeDrawing, qc]);

  const handleZoneDrawComplete = useCallback(async (payload) => {
    if (!currentRevision || !activeDrawing) return;
    try {
      const created = await createZone({
        projectId: activeDrawing.project_id,
        drawingId: activeDrawing.id,
        revisionId: currentRevision.id,
        label: "",
        ...parseZonePayload(payload),
      });
      toast.success(`Zone ${created.zone_key} created`);
      setSelectedZoneId(created.id);
      setZoneMode("view");
      await refetchZones();
    } catch (err) {
      toast.error(`Couldn't save zone: ${err?.message || "unknown error"}`);
    }
  }, [currentRevision, activeDrawing, refetchZones]);

  const onCalloutClick = useCallback((callout) => {
    if (!callout?.targetSheetNumber) return;
    const target = drawings.find(d => normalizeSN(d.sheet_number) === normalizeSN(callout.targetSheetNumber));
    if (target) setActiveId(target.id);
  }, [drawings]);

  const handleAnnotationClick = useCallback(async (annot) => {
    const target = await parseAnnotationLink(annot, { pdfDoc, totalPages, drawings });
    if (target.type === "page") {
      setCurrentPage(target.page);
    } else if (target.type === "url") {
      window.open(target.url, "_blank", "noopener,noreferrer");
    } else if (target.type === "sheet") {
      setActiveId(target.drawingId);
      setCurrentPage(1);
    }
  }, [pdfDoc, totalPages, drawings, setCurrentPage]);

  const handleFitWidth = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: 1, rotation });
    const container = canvasRef.current.parentElement;
    if (container) {
      const target = (container.clientWidth - 32) / vp.width;
      setZoom(+target.toFixed(2));
    }
  }, [pdfDoc, currentPage, rotation, canvasRef]);

  const handleFitPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: 1, rotation });
    const container = canvasRef.current.parentElement;
    if (!container) return;
    const sX = (container.clientWidth - 32) / vp.width;
    const sY = (container.clientHeight - 32) / vp.height;
    setZoom(+Math.min(sX, sY).toFixed(2));
  }, [pdfDoc, currentPage, rotation, canvasRef]);

  const handleZoomPreset = useCallback((v) => {
    if (v === "fitW") { handleFitWidth(); return; }
    if (v === "fitP") { handleFitPage();  return; }
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) setZoom(n);
  }, [handleFitWidth, handleFitPage]);

  const handleCanvasWheel = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => {
      const next = Math.max(0.1, Math.min(5.0, +(z + delta).toFixed(2)));
      return next;
    });
  }, []);

  const handleDownload = async () => {
    const url = resolvedUrl || await resolveFileUrl(activeDrawing?.file_url);
    if (!url) { toast.error("No file URL available"); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDrawing?.file_name || activeDrawing?.title || "drawing.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return {
    userId,
    sidebarOpen, setSidebarOpen,
    shortcutsOpen, setShortcutsOpen,
    filmstripOpen, setFilmstripOpen,
    contextOpen, setContextOpen,
    zoom, setZoom,
    rotation, setRotation,
    renderMode, setRenderMode,
    activeTool, setActiveTool,
    activeColor, setActiveColor,
    activeStamp, setActiveStamp,
    hideResolved, setHideResolved,
    exportMarkupOpen, setExportMarkupOpen,
    zoneMode, setZoneMode,
    drawShape, setDrawShape,
    zoneOverlay, setZoneOverlay,
    selectedZoneId, setSelectedZoneId,
    panelZoneId, setPanelZoneId,
    zoneFilter, setZoneFilter,
    proposalPanelOpen, setProposalPanelOpen,
    hoveredProposal, setHoveredProposal,
    showDeps, setShowDeps,
    drawings,
    filtered,
    activeDrawing,
    activeIndex,
    activeId,
    setActiveId,
    search,
    setSearch,
    markupScale,
    resolvedUrl,
    pdfDoc,
    totalPages,
    pdfError,
    currentPage,
    setCurrentPage,
    setPdfError,
    canvasRef,
    rendering,
    currentViewport,
    canvasSize,
    pageSize,
    linkHotspots,
    currentRevision,
    zones,
    refetchZones,
    pendingProposalCount,
    dependencyEdges,
    zoneSummaries,
    zoneDensities,
    zonesWithComputed,
    zoneStatusCounts,
    filteredZones,
    markup,
    overlayView,
    zonePanelSheet,
    handleCalibrate,
    handleNewRevision,
    handleZoneDrawComplete,
    onCalloutClick,
    handleAnnotationClick,
    handleFitWidth,
    handleFitPage,
    handleZoomPreset,
    handleCanvasWheel,
    handleDownload,
  };
}
