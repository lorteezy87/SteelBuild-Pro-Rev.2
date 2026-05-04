import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSearchParams, useNavigate } from "react-router-dom";
import { base44, resolveFileUrl } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { supabase } from "@/lib/supabase";
import * as pdfjsLib from "pdfjs-dist";
// Bundle the pdf.js worker with Vite so versions always match the installed
// pdfjs-dist package. Previously we loaded `.min.js` from cdnjs, but pdfjs-dist
// 4.x only ships `.mjs` workers and the file name was wrong, causing every
// drawing to fail to render.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import ViewerHeader from "@/components/drawings/viewer/ViewerHeader";
import ShortcutsOverlay from "@/components/drawings/viewer/ShortcutsOverlay";
import RenderSkeleton from "@/components/drawings/viewer/RenderSkeleton";
import ThumbnailFilmstrip from "@/components/drawings/viewer/ThumbnailFilmstrip";
import ContextPanel from "@/components/drawings/viewer/ContextPanel";
import AnnotationLayer from "@/components/drawings/viewer/AnnotationLayer";
import AnnotationToolbar, { MARKUP_COLORS } from "@/components/drawings/viewer/AnnotationToolbar";
import { useMarkup } from "@/components/drawings/viewer/useMarkup";
import { detectScaleFromPdf } from "@/components/drawings/viewer/detectScale";
import { parseRealDistance, formatScaleFraction } from "@/components/drawings/viewer/scaleParse";
import { extractStoragePathFromSignedUrl } from "@/components/drawings/viewer/storageUrl";
import ZoneLayer from "@/components/drawings/viewer/ZoneLayer";
import ZonePanel from "@/components/drawings/viewer/ZonePanel";
import ZoneFilterBar from "@/components/drawings/viewer/ZoneFilterBar";
import ProposalPanel from "@/components/drawings/viewer/ProposalPanel";
import { mono, normalizeSN } from "@/pages/drawingViewer/drawingViewerUtils";
import { useSpacebarPan } from "@/pages/drawingViewer/useSpacebarPan";
import { useDrawingsList } from "@/pages/drawingViewer/useDrawingsList";
import { usePdfLoader } from "@/pages/drawingViewer/usePdfLoader";
import { usePdfRenderer } from "@/pages/drawingViewer/usePdfRenderer";
import { useViewerKeyboardShortcuts } from "@/pages/drawingViewer/useViewerKeyboardShortcuts";
import SheetListSidebar from "@/pages/drawingViewer/SheetListSidebar";
import ZonesFloatingToolbar from "@/pages/drawingViewer/ZonesFloatingToolbar";
import ViewerToolbar from "@/pages/drawingViewer/ViewerToolbar";
import CalloutOverlay from "@/pages/drawingViewer/CalloutOverlay";
import PdfLinkHotspotLayer from "@/pages/drawingViewer/PdfLinkHotspotLayer";
import { useZoneData } from "@/pages/drawingViewer/useZoneData";
import {
  createZone as createZoneSvc,
  updateZone as updateZoneSvc,
  deleteZone as deleteZoneSvc,
  createNewRevisionAndCarryZones,
} from "@/lib/drawingHub";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default function DrawingViewer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id;

  const initialId = searchParams.get("id") || searchParams.get("drawingId") || searchParams.get("docId");

  const [userId, setUserId] = useState(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id || null));
  }, []);

  const [activeId, setActiveId] = useState(initialId || null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [filmstripOpen, setFilmstripOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  // "canvas" = pdfjs canvas render (enables clickable hyperlinks + cross-sheet nav)
  // "iframe" = browser-native PDF viewer (fallback, no annotation layer)
  // Default to canvas now that the pdfjs worker is bundled via Vite and reliable.
  const [renderMode, setRenderMode] = useState("canvas");

  const annotLayerRef = useRef(null);

  // ── Markup (Tier 3 annotations) ─────────────────────────────────────
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState(MARKUP_COLORS[0].value);

  // ── Load all drawings for this project ──────────────────────────────────────
  // useDrawingsList encapsulates the project drawings query, the search
  // filter, and the active-drawing lookup. activeIndex (used below by the
  // keyboard shortcuts effect) also lives in there.
  const { drawings, filtered, activeDrawing, activeIndex } = useDrawingsList({ projectId, activeId, search });
  const markupScale = activeDrawing?.markup_scale || null;

  // PDF lifecycle: file_url → signed URL → pdfjs document. Owns currentPage
  // because the loader needs to clamp it to the active drawing's pdf_page
  // when a multi-sheet master PDF resolves. setPdfError is exposed so the
  // canvas renderer (renderPage below) can surface render-time failures.
  const {
    resolvedUrl,
    pdfDoc,
    totalPages,
    pdfError,
    setPdfError,
    currentPage,
    setCurrentPage,
  } = usePdfLoader({ activeDrawing, renderMode });

  // Canvas-side renderer. Owns the <canvas> ref + the in-flight render task
  // and re-renders whenever the document, page index, zoom, or rotation
  // changes. Surfaces the current viewport + canvas dimensions so overlay
  // layers (markup, zones, callouts, link hotspots) can position themselves.
  const {
    canvasRef,
    rendering,
    currentViewport,
    canvasSize,
    pageSize,
    linkHotspots,
  } = usePdfRenderer({ pdfDoc, currentPage, zoom, rotation });

  const qc = useQueryClient();

  // Fetch the parent drawing_set for the active drawing so the header can
  // show a lock badge (and the admin Unlock action) without a second
  // round-trip per re-render. Cheap query — only refires when the
  // drawing changes.
  const setIdForActive = activeDrawing?.drawing_set_id || null;
  const { data: activeDrawingSet } = useQuery({
    queryKey: ["drawing_set", setIdForActive],
    queryFn: async () => {
      if (!setIdForActive) return null;
      const { data, error } = await supabase
        .from("drawing_sets")
        .select("id, set_name, is_locked, locked_at, locked_by, locked_reason")
        .eq("id", setIdForActive)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
    enabled: !!setIdForActive,
    staleTime: 30_000,
  });

  // Calibrate handler — invoked by AnnotationLayer when the user commits
  // a calibrate gesture. Prompts for the real-world distance (accepts
  // feet-inches like 10'-0, 10-0, 10'0", 10ft, or plain inches like 120
  // or 120"), parses it, computes scale factor, persists to the drawing.
  const handleCalibrate = useCallback(async (pdfInches) => {
    if (!activeDrawing?.id) return;
    if (pdfInches <= 0) return;

    const raw = window.prompt(
      `This page measures ${pdfInches.toFixed(2)}" on the PDF.\n\n` +
      `What is the REAL-WORLD distance between the two points?\n` +
      `Accepts: 10'-0, 10'0", 120", 120, 10ft, 10 feet`,
      "",
    );
    if (raw == null) return;              // user cancelled
    const realInches = parseRealDistance(raw);
    if (!Number.isFinite(realInches) || realInches <= 0) {
      toast.error(`Could not parse "${raw}" as a distance. Try formats like 10'-0 or 120"`);
      return;
    }
    const scale = realInches / pdfInches;
    try {
      await base44.entities.Drawing.update(activeDrawing.id, { markup_scale: scale });
      qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      toast.success(
        `Calibrated · 1 page inch = ${scale.toFixed(1)} real inches ` +
        `(${formatScaleFraction(scale)})`,
      );
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    }
  }, [activeDrawing, projectId, qc]);

  // Auto-detect scale from the PDF's title block text layer. Two paths:
  //
  //   1. Toolbar AUTO button → handleAutoDetectScale() below.
  //      Explicit, always toasts the result, overrides any existing scale.
  //      Useful when a user wants to force a re-detection.
  //
  //   2. Automatic on-load effect further down. Fires once per
  //      drawing-with-no-calibration after the PDF loads. Only applies
  //      on HIGH confidence matches (arch scale notation like 1/4"=1'-0"),
  //      never on the low-confidence metric fallback — metric ratios are
  //      often used for key maps / inset details and would silently
  //      misconfigure the sheet. Toast includes an UNDO action so a
  //      mis-detect is one click away from being reverted.
  const handleAutoDetectScale = useCallback(async () => {
    if (!activeDrawing?.id || !pdfDoc) return;
    try {
      const hit = await detectScaleFromPdf(pdfDoc);
      if (!hit) {
        toast.info("No scale pattern found in the PDF text layer. Use Calibrate (K) to set manually.");
        return;
      }
      await base44.entities.Drawing.update(activeDrawing.id, { markup_scale: hit.scale });
      qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      const confidence = hit.confidence === "high" ? "" : " (low confidence — verify with Calibrate if needed)";
      toast.success(`Detected scale ${hit.label} on page ${hit.page}${confidence}`);
    } catch (err) {
      toast.error(`Auto-detect failed: ${err.message}`);
    }
  }, [activeDrawing, pdfDoc, projectId, qc]);

  // Fire auto-detect the first time we see an uncalibrated drawing with
  // a loaded PDF. Per-session dedup via autoScaleAttemptedRef so quickly
  // switching drawings doesn't spam toasts. Skips entirely when the
  // drawing already has a markup_scale (manual or prior auto).
  const autoScaleAttemptedRef = useRef(new Set());
  useEffect(() => {
    if (!pdfDoc || !activeDrawing?.id) return;
    if (activeDrawing.markup_scale) return;
    if (autoScaleAttemptedRef.current.has(activeDrawing.id)) return;
    autoScaleAttemptedRef.current.add(activeDrawing.id);

    let cancelled = false;
    (async () => {
      try {
        const hit = await detectScaleFromPdf(pdfDoc);
        if (cancelled || !hit || hit.confidence !== "high") return;
        await base44.entities.Drawing.update(activeDrawing.id, { markup_scale: hit.scale });
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["drawings", projectId] });
        const drawingIdForUndo = activeDrawing.id;
        toast.success(`Auto-detected scale ${hit.label}`, {
          duration: 8000,
          action: {
            label: "Undo",
            onClick: async () => {
              try {
                await base44.entities.Drawing.update(drawingIdForUndo, { markup_scale: null });
                qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                toast.info("Scale reset — use Calibrate (K) to set manually.");
              } catch (err) {
                toast.error(`Undo failed: ${err.message}`);
              }
            },
          },
        });
      } catch {
        // Silent — auto-path should not spam errors. User can still
        // click AUTO on the toolbar for explicit feedback.
      }
    })();

    return () => { cancelled = true; };
  }, [pdfDoc, activeDrawing?.id, activeDrawing?.markup_scale, projectId, qc]);

  // Markup hook is intentionally placed after activeDrawing so we can pass
  // its initial array in — Tier 3 persists drawing markup in drawings.markup.
  const markup = useMarkup({
    drawingId: activeId,
    initialMarkup: activeDrawing?.markup,
  });

  // ── Drawing-hub zones (MVP Slice 0) ────────────────────────────────
  // Three modes for the overlay:
  //   "off"  — hidden (default; viewer behaves as it always has)
  //   "view" — render saved zones; click → select, dbl-click → panel
  //   "draw" — create a new zone; drawShape picks geometry
  const [zoneMode, setZoneMode] = useState("off");
  // V2: drawShape picks rect (default, MVP behaviour) vs polygon
  // (V2 irregular-area geometry). Lives at viewer level so it survives
  // switches between draw ↔ view without being reset.
  const [drawShape, setDrawShape] = useState("rect"); // "rect" | "polygon"
  // V2: overlay picks how existing zones are colored in view mode —
  // "status" uses the rule-engine color palette (red/amber/…); "heatmap"
  // recolors by weighted issue-density so the hottest zones jump out.
  const [zoneOverlay, setZoneOverlay] = useState("status"); // "status" | "heatmap"
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [panelZoneId, setPanelZoneId] = useState(null);  // open in right-side ZonePanel
  // Filter state for the zone overlay (V1.5). statusSet=empty means
  // "no status filter" = show all; typeKey="all" = show all types.
  // Lives at viewer level so it survives mode flips and panel opens.
  const [zoneFilter, setZoneFilter] = useState({ statusSet: new Set(), typeKey: "all" });
  // V3.0 — Drawing Hub Analyzer→Zones bridge. ProposalPanel is a
  // separate right-side drawer (mutually exclusive with ZonePanel).
  // hoveredProposal is the row the user is hovering in the panel —
  // we surface its bbox on the canvas via ZoneLayer.proposalOverlays.
  const [proposalPanelOpen, setProposalPanelOpen] = useState(false);
  const [hoveredProposal, setHoveredProposal] = useState(null);
  // V3.1 — Drawing Hub zone-to-zone dependency graph. DEPS toggle in
  // the toolbar surfaces directed edges between zones as arrows on
  // the canvas. Default OFF so the layer doesn't surprise V3.0 users.
  const [showDeps, setShowDeps] = useState(false);

  // Drawing-hub server queries + derived memos. State setters stay in
  // the page because the toolbar, filter bar, and panels all need them;
  // useZoneData only owns the data side.
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

  // Handler: user clicked "+ Rev" — mint a new revision, carry
  // zones + links over, flip is_current, and force a refetch so
  // the viewer lands on the fresh revision immediately.
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
      toast.success(
        `Revision ${res.revision.revision_code} created — ${res.zonesCloned} zones${
          res.linksCloned ? ` + ${res.linksCloned} links` : ""
        } carried forward`,
      );
      // Invalidate every drawing-hub query so the viewer repaints
      // against the new current revision immediately.
      qc.invalidateQueries({ queryKey: ["drawing-revision-current"] });
      qc.invalidateQueries({ queryKey: ["drawing-zones"] });
      qc.invalidateQueries({ queryKey: ["drawing-zones-summaries"] });
    } catch (err) {
      toast.error(`Couldn't create revision: ${err?.message || "unknown error"}`);
    }
  }, [activeDrawing, qc]);

  // Handler: user finished drawing a new zone. Payload carries the
  // shape discriminator — "rect" with a bbox (MVP) or "polygon" with
  // a points array (V2). Mint it with an auto zone_key; the detail
  // panel lets the user rename afterwards.
  const handleZoneDrawComplete = useCallback(async (payload) => {
    if (!currentRevision || !activeDrawing) return;
    try {
      let created;
      if (payload?.shape === "polygon") {
        created = await createZoneSvc({
          projectId:  activeDrawing.project_id,
          drawingId:  activeDrawing.id,
          revisionId: currentRevision.id,
          label:      "",
          shapeType:  "polygon",
          polygonPoints: payload.points,
        });
      } else {
        created = await createZoneSvc({
          projectId:  activeDrawing.project_id,
          drawingId:  activeDrawing.id,
          revisionId: currentRevision.id,
          label:      "",
          xMin: payload.xMin, yMin: payload.yMin,
          xMax: payload.xMax, yMax: payload.yMax,
        });
      }
      toast.success(`Zone ${created.zone_key} created`);
      setSelectedZoneId(created.id);
      // Drop back to view mode so the user can see their new zone.
      setZoneMode("view");
      await refetchZones();
    } catch (err) {
      toast.error(`Couldn't save zone: ${err?.message || "unknown error"}`);
    }
  }, [currentRevision, activeDrawing, refetchZones]);

  // When the active drawing changes, jump to its source PDF page so callouts
  // overlay the correct sheet. Stored as `pdf_page` by DrawingSetUploadModal;
  // legacy rows without it default to page 1.
  useEffect(() => {
    if (!activeDrawing) return;
    const page = Number(activeDrawing.pdf_page) || 1;
    setCurrentPage(page);
  }, [activeDrawing?.id]);

  // Callout → navigation handler. If the targetSheetNumber resolves to a
  // drawing in the project list, switch to it. The effect above then jumps
  // to that drawing's pdf_page automatically.
  const onCalloutClick = useCallback((callout) => {
    if (!callout?.targetSheetNumber) return;
    const target = drawings.find(d =>
      normalizeSN(d.sheet_number) === normalizeSN(callout.targetSheetNumber)
    );
    if (target) setActiveId(target.id);
  }, [drawings]);

  // ── Handle annotation link click ──────────────────────────────────────────
  const handleAnnotationClick = useCallback(async (annot) => {
    // 1. Internal PDF destination (page ref within the same document)
    if (annot.dest) {
      try {
        let pageNum = null;
        if (typeof annot.dest === "string") {
          // Named destination — resolve via the PDF document
          const dest = await pdfDoc.getDestination(annot.dest);
          if (dest) {
            const pageRef = dest[0];
            pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
          }
        } else if (Array.isArray(annot.dest)) {
          // Explicit destination array [pageRef, ...]
          const pageRef = annot.dest[0];
          pageNum = await pdfDoc.getPageIndex(pageRef) + 1;
        }
        if (pageNum && pageNum >= 1 && pageNum <= totalPages) {
          setCurrentPage(pageNum);
          return;
        }
      } catch { /* fall through to cross-sheet lookup */ }
    }

    // 2. External URL
    if (annot.url) {
      window.open(annot.url, "_blank", "noopener,noreferrer");
      return;
    }

    // 3. Cross-sheet reference — try to match against sheet numbers in this project
    //    Common patterns: "S-201", "S201", "A/S201", "DETAIL 3/S-201"
    const refText = annot.title || annot.unsafeUrl || "";
    if (refText) {
      const match = refText.match(/([A-Z]{1,2}[-\s]?\d{3,4})/i);
      if (match) {
        const sheetRef = match[1].toUpperCase().replace(/\s+/g, "");
        const target = drawings.find(d => {
          const sn = (d.sheet_number || "").toUpperCase().replace(/[-\s]/g, "");
          return sn === sheetRef || sn === sheetRef.replace("-", "");
        });
        if (target) {
          setActiveId(target.id);
          setCurrentPage(1);
          return;
        }
      }
    }
  }, [pdfDoc, totalPages, drawings]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  // Hook lives in useViewerKeyboardShortcuts; binding logic + key map are
  // identical to the previous inline effect.
  useViewerKeyboardShortcuts({
    filtered,
    activeIndex,
    totalPages,
    setActiveId,
    setZoom,
    setCurrentPage,
    setSidebarOpen,
    setFilmstripOpen,
    setContextOpen,
    setRotation,
    setShortcutsOpen,
    setActiveTool,
  });

  // ── Fit width / Fit page / zoom preset ────────────────────────────────────
  const handleFitWidth = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: 1, rotation });
    const container = canvasRef.current.parentElement;
    if (container) {
      // 16px pad so the page doesn't butt up against the scroll container edges.
      const target = (container.clientWidth - 32) / vp.width;
      setZoom(+target.toFixed(2));
    }
  }, [pdfDoc, currentPage, rotation]);

  const handleFitPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp = page.getViewport({ scale: 1, rotation });
    const container = canvasRef.current.parentElement;
    if (!container) return;
    const sX = (container.clientWidth - 32) / vp.width;
    const sY = (container.clientHeight - 32) / vp.height;
    setZoom(+Math.min(sX, sY).toFixed(2));
  }, [pdfDoc, currentPage, rotation]);

  // Dispatch from the zoom preset <select>. Keeps the select value in sync
  // with `zoom` state because the first option is always the current zoom.
  const handleZoomPreset = useCallback((v) => {
    if (v === "fitW") { handleFitWidth(); return; }
    if (v === "fitP") { handleFitPage();  return; }
    const n = parseFloat(v);
    if (Number.isFinite(n) && n > 0) setZoom(n);
  }, [handleFitWidth, handleFitPage]);

  // Ctrl/Cmd + wheel = zoom at cursor. Without the ctrl check, users trying
  // to scroll the drawing with a touchpad would accidentally zoom.
  const handleCanvasWheel = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => {
      const next = Math.max(0.1, Math.min(5.0, +(z + delta).toFixed(2)));
      return next;
    });
  }, []);

  // Spacebar-hold pan. Hook returns both the React state (drives the cursor
  // styling on the container) and a mutable ref read by the imperative
  // mousedown/mousemove handlers attached via the container ref callback.
  const { spacePan, spacebarPanRef } = useSpacebarPan();

  // ── Download ───────────────────────────────────────────────────────────────
  const handleDownload = async () => {
    const url = resolvedUrl || await resolveFileUrl(activeDrawing?.file_url);
    if (!url) { toast?.error?.("No file URL available"); return; }
    const a = document.createElement("a");
    a.href = url;
    a.download = activeDrawing?.file_name || activeDrawing?.title || "drawing.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-page)", overflow: "hidden" }}>

      {/* ── Sheet List Sidebar (collapsible) ──────────────────────────────── */}
      <SheetListSidebar
        sidebarOpen={sidebarOpen}
        navigate={navigate}
        search={search}
        setSearch={setSearch}
        filtered={filtered}
        drawings={drawings}
        activeId={activeId}
        setActiveId={setActiveId}
        activeIndex={activeIndex}
      />

      {/* ── Main Viewer ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Breadcrumb + stage pipeline + lock badge */}
        <ViewerHeader
          projectName={activeProject?.name}
          activeDrawing={activeDrawing}
          drawingSet={activeDrawingSet}
          onUnlock={async () => {
            try {
              const { unlockSet } = await import("@/lib/drawingHub");
              await unlockSet({ setId: activeDrawingSet.id });
              await qc.invalidateQueries({ queryKey: ["drawing_set", activeDrawingSet.id] });
              toast.success("Set unlocked. Edits are now allowed.");
            } catch (err) {
              toast.error("Unlock failed: " + (err?.message || "Unknown error"));
            }
          }}
        />

        {/* Viewer toolbar */}
        <ViewerToolbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          activeDrawing={activeDrawing}
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          zoom={zoom}
          setZoom={setZoom}
          handleZoomPreset={handleZoomPreset}
          rotation={rotation}
          setRotation={setRotation}
          renderMode={renderMode}
          setRenderMode={setRenderMode}
          handleDownload={handleDownload}
          pdfDoc={pdfDoc}
          markupScale={markupScale}
          handleAutoDetectScale={handleAutoDetectScale}
          filmstripOpen={filmstripOpen}
          setFilmstripOpen={setFilmstripOpen}
          contextOpen={contextOpen}
          setContextOpen={setContextOpen}
          setShortcutsOpen={setShortcutsOpen}
        />

        {/* Viewer area — iframe (browser-native) or pdfjs canvas.
            Deep slate backdrop with a subtle radial vignette so the paper
            (drop-shadowed canvas) reads as a physical sheet on a layout
            table. Matches the "legit drawing viewer" look of Bluebeam /
            PlanGrid / Procore.

            Wrapped in a `position: relative` container so the markup
            toolbar can float over the viewport (see below) and NOT scroll
            away with the content when the user zooms in or pans. */}
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Markup toolbar — fixed to the viewer pane, NOT to the scroll
              content. Stays visible no matter how far the user pans the
              sheet. Only shown when we actually have a drawing to mark up. */}
          {activeDrawing?.file_url && renderMode === "canvas" && !pdfError && (
            <AnnotationToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              activeColor={activeColor}
              onColorChange={setActiveColor}
              markupCount={markup.items.filter((m) => (m.pdf_page || 1) === currentPage).length}
              onClearPage={() => {
                markup.items
                  .filter((m) => (m.pdf_page || 1) === currentPage)
                  .forEach((m) => markup.removeItem(m.id));
              }}
              saving={markup.saving}
              saveError={markup.saveError}
            />
          )}

          {/* Zones toggle — floats top-right of the viewer pane. Three-state:
              OFF → VIEW (show saved zones) → DRAW (drag to create). Left
              ghostly in the layout when we don't have a renderable sheet. */}
          {activeDrawing?.file_url && renderMode === "canvas" && !pdfError && (
            <ZonesFloatingToolbar
              zoneMode={zoneMode}
              setZoneMode={setZoneMode}
              setSelectedZoneId={setSelectedZoneId}
              filteredZones={filteredZones}
              zones={zones}
              zoneOverlay={zoneOverlay}
              setZoneOverlay={setZoneOverlay}
              showDeps={showDeps}
              setShowDeps={setShowDeps}
              drawShape={drawShape}
              setDrawShape={setDrawShape}
              activeDrawing={activeDrawing}
              proposalPanelOpen={proposalPanelOpen}
              setProposalPanelOpen={setProposalPanelOpen}
              pendingProposalCount={pendingProposalCount}
              currentRevision={currentRevision}
              handleNewRevision={handleNewRevision}
            />
          )}

          {/* Zone filter bar — only useful when the overlay is
              actually rendering (VIEW / DRAW). Hidden in OFF mode to
              keep the viewer chrome quiet. */}
          {activeDrawing?.file_url && renderMode === "canvas" && !pdfError && zoneMode !== "off" && zones.length > 0 && (
            <ZoneFilterBar
              filter={zoneFilter}
              onChange={setZoneFilter}
              statusCounts={zoneStatusCounts}
              totalVisible={filteredZones.length}
              totalAll={zonesWithComputed.length}
            />
          )}
        <div
          onWheel={handleCanvasWheel}
          ref={(el) => {
            // Keep a pan drag ref so spacebar-hold → drag pans. This is the
            // standard pro-viewer pan: hold space, mouse drag scrolls the
            // container, cursor flips to grab/grabbing for feedback.
            if (!el) return;
            if (el._panBound) return;
            el._panBound = true;
            let panning = false;
            let startX = 0, startY = 0, scrollX = 0, scrollY = 0;
            el.addEventListener("mousedown", (ev) => {
              // Only pan on LEFT mouse AND spacebar held, OR middle mouse.
              const shouldPan = (ev.button === 0 && spacebarPanRef.current) || ev.button === 1;
              if (!shouldPan) return;
              ev.preventDefault();
              panning = true;
              startX = ev.clientX; startY = ev.clientY;
              scrollX = el.scrollLeft; scrollY = el.scrollTop;
              el.style.cursor = "grabbing";
            });
            const stop = () => { if (panning) { panning = false; el.style.cursor = spacebarPanRef.current ? "grab" : ""; } };
            el.addEventListener("mouseup", stop);
            el.addEventListener("mouseleave", stop);
            el.addEventListener("mousemove", (ev) => {
              if (!panning) return;
              el.scrollLeft = scrollX - (ev.clientX - startX);
              el.scrollTop  = scrollY - (ev.clientY - startY);
            });
          }}
          style={{
            flex: 1,
            overflow: "auto",
            display: "flex",
            justifyContent: "center",
            alignItems: "stretch",
            // Neutral workspace — works in both light + dark themes.
            background: "var(--bg-void)",
            cursor: spacePan ? "grab" : "default",
          }}
        >
          {!activeDrawing ? (
            <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.2 }}>▦</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.2em" }}>SELECT A SHEET FROM THE SIDEBAR</p>
              <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 8 }}>← → to navigate · + − to zoom · 0 to reset</p>
            </div>
          ) : !activeDrawing.file_url ? (
            <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>📄</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.15em" }}>NO PDF ATTACHED</p>
              <p style={{ ...mono, fontSize: 9, color: "var(--border-strong)", marginTop: 6 }}>Edit this sheet to attach a PDF file URL</p>
            </div>
          ) : renderMode === "iframe" ? (
            !resolvedUrl ? (
              <div style={{ margin: "auto", ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.2em" }}>RESOLVING FILE…</div>
            ) : (
              <iframe
                key={resolvedUrl}
                src={resolvedUrl}
                title={activeDrawing.title || activeDrawing.sheet_number}
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
              />
            )
          ) : pdfError ? (
            <div style={{ margin: "auto", textAlign: "center", padding: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>⚠</div>
              <p style={{ ...mono, fontSize: 11, color: "var(--status-error)", letterSpacing: "0.1em" }}>{pdfError}</p>
              <button
                onClick={() => setRenderMode("iframe")}
                style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 12, padding: "6px 14px", background: "rgba(200,155,32,0.12)", border: "1px solid var(--accent)", borderRadius: 2, cursor: "pointer" }}
              >
                SWITCH TO IFRAME VIEW
              </button>
              {activeDrawing.file_url && (
                <button
                  onClick={async () => {
                    try {
                      const url = await resolveFileUrl(activeDrawing.file_url);
                      if (url) window.open(url, "_blank", "noopener,noreferrer");
                    } catch { /* silently fail */ }
                  }}
                  style={{ ...mono, fontSize: 10, color: "var(--accent)", marginTop: 8, display: "block", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  OPEN IN NEW TAB →
                </button>
              )}
            </div>
          ) : (
            <div style={{ position: "relative", padding: 32 }}>
              {rendering && (
                <RenderSkeleton label={`Rendering page ${currentPage}${totalPages > 1 ? ` of ${totalPages}` : ""}`} />
              )}

              {/* Canvas + overlay wrapper. The wrapper is sized to the
                  canvas so absolutely-positioned overlay children line up
                  with the rendered PDF regardless of zoom or padding. It
                  hosts two layers: (1) the PDF link-annotation hotspots
                  harvested by pdfjs and (2) the regex-detected callouts
                  stored on the drawing record.

                  Paper-on-dark: the canvas gets a stronger drop shadow +
                  a thin light border so it reads like a real sheet of
                  vellum on a dark layout table. */}
              <div style={{ position: "relative", display: "inline-block" }}>
                <canvas
                  ref={canvasRef}
                  style={{
                    display: "block",
                    boxShadow: "0 12px 48px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.45)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    background: "#fff",
                  }}
                />

                {/* ── PDF link-hotspot layer (clickable internal/external links) ── */}
                <PdfLinkHotspotLayer
                  linkHotspots={linkHotspots}
                  canvasRef={canvasRef}
                  annotLayerRef={annotLayerRef}
                  onAnnotationClick={handleAnnotationClick}
                />

                {/* ── Markup layer (Tier 3: user-drawn redlines/shapes/notes) ──
                     Rendered ABOVE link hotspots + callouts so the user can
                     draw freely and selected items stay on top. */}
                <AnnotationLayer
                  viewport={currentViewport}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                  pdfPage={currentPage}
                  items={markup.items}
                  activeTool={activeTool}
                  activeColor={activeColor}
                  markupScale={markupScale}
                  onAddItem={markup.addItem}
                  onRemoveItem={markup.removeItem}
                  onUpdateItem={markup.updateItem}
                  onCalibrate={handleCalibrate}
                />

                {/* ── Drawing-hub coordination zones (MVP Slice 0) ──
                    Normalized-bbox rectangles linking to RFIs / WPs /
                    deliveries / photos / inspections. Toggled by the
                    "Zones" button in the toolbar; in "draw" mode the
                    user can drag out a new zone, which saves via
                    drawingHub.createZone and snaps back to "view". */}
                <ZoneLayer
                  mode={zoneMode}
                  drawShape={drawShape}
                  overlay={zoneOverlay}
                  zoneDensities={zoneDensities}
                  canvasWidth={canvasSize.width}
                  canvasHeight={canvasSize.height}
                  zones={filteredZones}
                  zoneSummaries={zoneSummaries}
                  selectedZoneId={selectedZoneId}
                  onSelectZone={setSelectedZoneId}
                  onOpenZone={(zid) => { setSelectedZoneId(zid); setPanelZoneId(zid); }}
                  onDrawComplete={handleZoneDrawComplete}
                  proposalOverlays={hoveredProposal ? [{
                    id: hoveredProposal.id,
                    x_min: Number(hoveredProposal.x_min),
                    y_min: Number(hoveredProposal.y_min),
                    x_max: Number(hoveredProposal.x_max),
                    y_max: Number(hoveredProposal.y_max),
                    status: hoveredProposal.status,
                    label: hoveredProposal.suggested_label,
                  }] : []}
                  dependencyEdges={dependencyEdges}
                  showDependencies={showDeps}
                />

                {/* ── Callout overlay layer — regex-detected cross-sheet refs ── */}
                <CalloutOverlay
                  activeDrawing={activeDrawing}
                  drawings={drawings}
                  pageSize={pageSize}
                  zoom={zoom}
                  onCalloutClick={onCalloutClick}
                />
              </div>
            </div>
          )}
        </div>
        </div>{/* /position:relative viewer-pane wrapper for floating markup toolbar */}

        {/* Thumbnail filmstrip */}
        {filmstripOpen && drawings.length > 0 && (
          <ThumbnailFilmstrip
            drawings={filtered.length > 0 ? filtered : drawings}
            activeId={activeId}
            onSelect={setActiveId}
            resolveUrl={resolveFileUrl}
            extractStoragePath={extractStoragePathFromSignedUrl}
          />
        )}

        {/* Keyboard shortcuts hint */}
        <div style={{ padding: "6px 16px", borderTop: "1px solid var(--hover-bg)", background: "var(--bg-surface)", display: "flex", gap: 16, alignItems: "center" }}>
          {[["← →", "Navigate sheets"], ["+ −", "Zoom"], ["0", "Reset zoom"], ["[ ]", "Toggle sidebar"], ["Page Up/Dn", "PDF pages"]].map(([key, desc]) => (
            <span key={key} style={{ ...mono, fontSize: 9, color: "var(--border-strong)" }}>
              <span style={{ color: "var(--text-muted)" }}>{key}</span> {desc}
            </span>
          ))}
          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            style={{
              marginLeft: "auto",
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              color: "var(--accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            All shortcuts (?)
          </button>
        </div>
      </div>

      {/* Right-rail context panel — linked RFIs, callouts, sibling sheets */}
      {contextOpen && activeDrawing && (
        <ContextPanel
          activeDrawing={activeDrawing}
          allDrawings={drawings}
          onSelect={setActiveId}
          onClose={() => setContextOpen(false)}
        />
      )}

      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Zone coordination panel — opens on double-click of a zone. All
          zone edits (rename, status change, delete) flow through here.
          Updates persist via drawingHub and invalidate the zone / link
          queries so the overlay count badges stay in sync. */}
      {/* V3.0 — Drawing Hub Analyzer→Zones bridge drawer. Sits in the
          same right-side slot as ZonePanel; the two are mutually
          exclusive — opening one closes the other so the canvas isn't
          covered by two stacked drawers. */}
      <ProposalPanel
        open={proposalPanelOpen && !panelZoneId}
        onClose={() => { setProposalPanelOpen(false); setHoveredProposal(null); }}
        projectId={projectId}
        drawing={activeDrawing}
        drawingRevisionId={currentRevision?.id}
        analysisId={null /* viewer doesn't currently know which analysis is active; service falls back to "all findings on this drawing" */}
        userId={userId}
        onHoverProposal={setHoveredProposal}
        onProposalsChange={() => {
          // Refetch zones so accept/merge results show on the canvas
          // immediately. Counts query auto-invalidates via the mutation.
          refetchZones();
        }}
      />

      <ZonePanel
        zone={panelZoneId ? zones.find((z) => z.id === panelZoneId) : null}
        sheet={currentRevision
          ? { sheet_number: currentRevision.sheet_number, sheet_title: currentRevision.sheet_title, revision_code: currentRevision.revision_code }
          : activeDrawing
            ? { sheet_number: activeDrawing.sheet_number || activeDrawing.drawing_number, sheet_title: activeDrawing.title }
            : null}
        open={!!panelZoneId}
        onClose={() => setPanelZoneId(null)}
        userId={userId}
        onZoneUpdate={async (patch) => {
          if (!panelZoneId) return;
          await updateZoneSvc(panelZoneId, patch);
          await refetchZones();
        }}
        onZoneDelete={async () => {
          if (!panelZoneId) return;
          await deleteZoneSvc(panelZoneId);
          setPanelZoneId(null);
          setSelectedZoneId(null);
          await refetchZones();
        }}
        // V3.1 — cross-sheet dependency rows in the panel deep-link to
        // the target drawing. Closing the panel keeps the navigation
        // feeling instant; the user can re-open the equivalent zone on
        // the destination sheet.
        onSheetNavigate={(drawingId) => {
          if (!drawingId) return;
          setPanelZoneId(null);
          setSelectedZoneId(null);
          setActiveId(drawingId);
        }}
      />
    </div>
  );
}
