import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Keyboard, Film, RotateCw } from "lucide-react";
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
import { listZoneProposals } from "@/lib/drawingHub";
import { STAGES, mono, toolBtn, normalizeSN } from "@/pages/drawingViewer/drawingViewerUtils";
import { useSpacebarPan } from "@/pages/drawingViewer/useSpacebarPan";
import { useDrawingsList } from "@/pages/drawingViewer/useDrawingsList";
import { usePdfLoader } from "@/pages/drawingViewer/usePdfLoader";
import { usePdfRenderer } from "@/pages/drawingViewer/usePdfRenderer";
import { useViewerKeyboardShortcuts } from "@/pages/drawingViewer/useViewerKeyboardShortcuts";
import SheetListSidebar from "@/pages/drawingViewer/SheetListSidebar";
import {
  ensureCurrentRevision,
  listZones,
  listLinksForZones,
  hydrateLinks,
  computeZoneDensity,
  createZone as createZoneSvc,
  updateZone as updateZoneSvc,
  deleteZone as deleteZoneSvc,
  summarizeLinks,
  computeZoneStatus,
  recomputeAndPersistZoneStatus,
  createNewRevisionAndCarryZones,
  // V3.1 — zone-to-zone dependency graph
  listZoneDependencies,
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

  // Resolve (or create) the drawing_revisions row that zones attach to.
  // MVP: every drawing gets a v1 revision the first time the user opens
  // zones on it. No explicit revision onboarding required.
  const { data: currentRevision } = useQuery({
    queryKey: ["drawing-revision-current", activeId],
    queryFn: async () => {
      if (!activeDrawing?.id) return null;
      return ensureCurrentRevision({ drawing: activeDrawing });
    },
    enabled: !!activeDrawing?.id && zoneMode !== "off",
    staleTime: 5 * 60 * 1000,
  });

  const { data: zones = [], refetch: refetchZones } = useQuery({
    queryKey: ["drawing-zones", currentRevision?.id],
    queryFn: () => listZones(currentRevision?.id),
    enabled: !!currentRevision?.id,
    staleTime: 30 * 1000,
  });

  // V3.0 — pending proposal count for the drawer-launcher badge.
  // Quiet query (limit:1) just to read the total; the panel itself
  // refetches the full list when it opens.
  const { data: proposalCountData } = useQuery({
    queryKey: ["drawing-zone-proposals-count", projectId, activeDrawing?.id, currentRevision?.id || null],
    queryFn: () => listZoneProposals({
      projectId,
      drawingId:         activeDrawing.id,
      drawingRevisionId: currentRevision?.id || undefined,
      status:            "pending",
      limit:             1,
    }),
    enabled: !!projectId && !!activeDrawing?.id,
    staleTime: 30 * 1000,
  });
  const pendingProposalCount = proposalCountData?.total ?? 0;

  // V3.1 — pull every active dependency edge incident to this drawing
  // (either source or target zone lives on the current sheet). Used
  // for the canvas DEPS overlay; cross-sheet edges still come back so
  // we can render their "→ Sheet X" pills.
  const { data: depsData = { rows: [], total: 0 } } = useQuery({
    queryKey: ["drawing-zone-dependencies-sheet", projectId, activeDrawing?.id],
    queryFn: () => listZoneDependencies({
      projectId,
      drawingId: activeDrawing.id,
    }),
    enabled: !!projectId && !!activeDrawing?.id && showDeps,
    staleTime: 30 * 1000,
  });
  const sheetDependencies = depsData.rows || [];

  // Build the dependencyEdges payload ZoneLayer wants. For each row:
  //   - resolve source/target centroid from the hydrated bbox
  //   - flag cross-sheet when one endpoint isn't on the active drawing
  //   - hand the relationship + propagation_weight through verbatim
  // Centroid math uses the hydrated bbox (mid-x, mid-y) so the arrow
  // endpoints land in the visual middle of the zone, not its corner.
  const dependencyEdges = useMemo(() => {
    if (!showDeps || sheetDependencies.length === 0) return [];
    const out = [];
    for (const d of sheetDependencies) {
      if (!d.__source || !d.__target) continue;
      const src = d.__source;
      const tgt = d.__target;
      const srcOnSheet = src.drawing_id === activeDrawing?.id;
      const tgtOnSheet = tgt.drawing_id === activeDrawing?.id;
      const srcCenter = srcOnSheet
        ? [(Number(src.x_min) + Number(src.x_max)) / 2, (Number(src.y_min) + Number(src.y_max)) / 2]
        : null;
      const tgtCenter = tgtOnSheet
        ? [(Number(tgt.x_min) + Number(tgt.x_max)) / 2, (Number(tgt.y_min) + Number(tgt.y_max)) / 2]
        : null;
      // Anchor cross-sheet pills at whichever endpoint IS on this sheet.
      if (!srcOnSheet && !tgtOnSheet) continue;
      if (srcOnSheet && tgtOnSheet) {
        out.push({
          id:                d.id,
          sourceCenter:      srcCenter,
          targetCenter:      tgtCenter,
          relationship:      d.relationship,
          propagationWeight: Number(d.propagation_weight ?? 1),
          isCrossSheet:      false,
          crossSheetLabel:   null,
        });
      } else if (srcOnSheet) {
        // Outbound to another sheet — pill at source.
        out.push({
          id:                d.id,
          sourceCenter:      srcCenter,
          targetCenter:      null,
          relationship:      d.relationship,
          propagationWeight: Number(d.propagation_weight ?? 1),
          isCrossSheet:      true,
          crossSheetLabel:   tgt.sheet_number || "other sheet",
        });
      } else {
        // Inbound from another sheet — pill at target (which IS on this sheet).
        out.push({
          id:                d.id,
          sourceCenter:      tgtCenter, // anchor at the on-sheet endpoint
          targetCenter:      null,
          relationship:      d.relationship,
          propagationWeight: Number(d.propagation_weight ?? 1),
          isCrossSheet:      true,
          crossSheetLabel:   `from ${src.sheet_number || "other sheet"}`,
        });
      }
    }
    return out;
  }, [showDeps, sheetDependencies, activeDrawing?.id]);

  // Link-count summaries keyed by zone id — used by the label chip to
  // show "Z-001 · 3" when a zone has 3 linked records. Refetches when
  // the list of zones changes (e.g. a new one is drawn).
  //
  // This query also runs the rule engine over each zone's links and
  // captures the computed status in `computedByZone`. That drives
  // live overlay colors (via zonesWithComputed below) AND fires a
  // best-effort background recompute-and-persist so the stored
  // zone.status row stays in sync with reality — next time the viewer
  // loads it can paint the right color immediately without waiting
  // on a re-fetch of every linked record.
  const { data: zoneData = { summaries: new Map(), computed: new Map(), densities: new Map() } } = useQuery({
    queryKey: ["drawing-zones-summaries", currentRevision?.id, zones.length, zones.map((z) => z.id + ":" + z.status).join(",")],
    queryFn: async () => {
      const ids = zones.map((z) => z.id);
      if (ids.length === 0) return { summaries: new Map(), computed: new Map(), densities: new Map() };
      const byZone = await listLinksForZones(ids);
      const summaries = new Map();
      const computed = new Map();
      const densities = new Map();
      // Pre-hydrate every link in one sweep per record type (hydrateLinks
      // already batches by type), then feed each zone's subset into the
      // rule engine.
      const allLinks = [];
      for (const arr of byZone.values()) allLinks.push(...arr);
      const hydrated = await hydrateLinks(allLinks); // Map<linkId, {link, record}>
      for (const z of zones) {
        const zoneLinks = byZone.get(z.id) || [];
        summaries.set(z.id, summarizeLinks(zoneLinks));
        const zoneItems = zoneLinks
          .map((l) => hydrated.get(l.id))
          .filter(Boolean);
        computed.set(z.id, computeZoneStatus(zoneItems));
        densities.set(z.id, computeZoneDensity(zoneItems));
      }
      // Fire-and-forget: persist computed status for any zone where
      // the stored value drifted and the user hasn't manually pinned
      // it. Never blocks the overlay render on these writes.
      (async () => {
        for (const z of zones) {
          const c = computed.get(z.id);
          if (!c) continue;
          if (z.is_manual_status_override) continue;
          if (c.status === z.status) continue;
          try {
            await recomputeAndPersistZoneStatus(
              z,
              (byZone.get(z.id) || []).map((l) => hydrated.get(l.id)).filter(Boolean),
            );
          } catch {
            // Silent — rule-engine writes are advisory; panel still
            // shows the right answer.
          }
        }
      })();
      return { summaries, computed, densities };
    },
    enabled: zones.length > 0,
    staleTime: 30 * 1000,
  });
  const zoneSummaries = zoneData.summaries;
  const zoneComputed  = zoneData.computed;
  const zoneDensities = zoneData.densities;

  // Overlay reads the computed status when available so colors are
  // live even if the DB write hasn't caught up yet. Falls back to
  // zone.status (which also stays fresh via the background write
  // above). is_manual_status_override wins — rule engine is advisory
  // when the user has explicitly pinned a color.
  const zonesWithComputed = useMemo(() => {
    return zones.map((z) => {
      if (z.is_manual_status_override) return z;
      const c = zoneComputed?.get?.(z.id);
      if (!c || !c.status) return z;
      return { ...z, status: c.status };
    });
  }, [zones, zoneComputed]);

  // Status counts over the live (post-compute) zones — feeds the
  // filter bar chips ("red · 3") and the summary "X/Y visible" label.
  const zoneStatusCounts = useMemo(() => {
    const out = {};
    for (const z of zonesWithComputed) {
      out[z.status] = (out[z.status] || 0) + 1;
    }
    return out;
  }, [zonesWithComputed]);

  // Apply the filter bar's choices. Empty statusSet = "no filter".
  const filteredZones = useMemo(() => {
    const { statusSet, typeKey } = zoneFilter;
    const statusActive = statusSet && statusSet.size > 0;
    const typeActive   = typeKey && typeKey !== "all";
    if (!statusActive && !typeActive) return zonesWithComputed;
    return zonesWithComputed.filter((z) => {
      if (statusActive && !statusSet.has(z.status)) return false;
      if (typeActive && z.zone_type !== typeKey) return false;
      return true;
    });
  }, [zonesWithComputed, zoneFilter]);

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

        {/* Breadcrumb + stage pipeline */}
        <ViewerHeader projectName={activeProject?.name} activeDrawing={activeDrawing} />

        {/* Viewer toolbar */}
        <div style={{ height: 48, borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", gap: 10, padding: "0 16px", flexShrink: 0, background: "var(--bg-surface)" }}>
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? "Hide sheet list (more drawing space)" : "Show sheet list"}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              padding: "6px 8px",
              color: sidebarOpen ? "var(--accent)" : "var(--text-muted)",
              background: sidebarOpen ? "var(--accent-muted)" : "var(--bg-surface-low)",
              border: sidebarOpen ? "1px solid var(--accent)" : "1px solid var(--border-default)",
              flexShrink: 0,
            }}
          >
            {sidebarOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          </button>
          {/* Sheet info */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeDrawing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{activeDrawing.sheet_number}</span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeDrawing.title}</span>
                <span style={{ ...mono, fontSize: 9, color: "var(--text-muted)", flexShrink: 0 }}>R{activeDrawing.revision_number ?? "0"}</span>
                {activeDrawing.stage && (
                  <span style={{ ...mono, fontSize: 9, fontWeight: 700, color: STAGES[activeDrawing.stage]?.color, flexShrink: 0 }}>
                    {activeDrawing.stage === "Released" ? "IFC" : activeDrawing.stage}
                  </span>
                )}
              </div>
            ) : (
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>SELECT A SHEET</span>
            )}
          </div>

          {/* Page nav (for multi-page PDFs) */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
                style={toolBtn}>‹</button>
              <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>{currentPage}/{totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
                style={toolBtn}>›</button>
            </div>
          )}

          {/* Zoom controls — pro-viewer style: -/+ around a preset dropdown.
              Dropdown value "fitW" / "fitP" / "1" maps to actions in handleZoomPreset. */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))} title="Zoom out (−)" style={toolBtn}>−</button>
            <select
              value={zoom.toFixed(2)}
              onChange={(e) => handleZoomPreset(e.target.value)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 6px",
                border: "1px solid var(--border-default)", borderRadius: 4,
                background: "var(--bg-surface)", color: "var(--text-primary)",
                minWidth: 82, cursor: "pointer",
              }}
            >
              {/* Current value as first item so the select always reflects reality */}
              <option value={zoom.toFixed(2)}>{Math.round(zoom * 100)}%</option>
              <option value="fitW">Fit Width</option>
              <option value="fitP">Fit Page</option>
              <option value="0.50">50%</option>
              <option value="0.75">75%</option>
              <option value="1.00">100%</option>
              <option value="1.25">125%</option>
              <option value="1.50">150%</option>
              <option value="2.00">200%</option>
              <option value="3.00">300%</option>
              <option value="4.00">400%</option>
            </select>
            <button onClick={() => setZoom(z => Math.min(5.0, +(z + 0.1).toFixed(2)))} title="Zoom in (+)" style={toolBtn}>+</button>
          </div>
          <button
            onClick={() => setRotation(r => (r + 90) % 360)}
            title={`Rotate (R) — currently ${rotation}°`}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: rotation !== 0 ? "var(--accent)" : "var(--text-muted)",
              background: rotation !== 0 ? "rgba(200,155,32,0.10)" : "none",
            }}
          >
            <RotateCw size={12} />
            {rotation !== 0 && <span style={{ ...mono, fontSize: 9, fontWeight: 700 }}>{rotation}°</span>}
          </button>
          <button
            onClick={() => setRenderMode(m => m === "iframe" ? "canvas" : "iframe")}
            title={renderMode === "iframe" ? "Switch to canvas (markups)" : "Switch to iframe (browser PDF)"}
            style={{
              ...toolBtn, ...mono, fontSize: 9,
              color: renderMode === "iframe" ? "var(--accent)" : "var(--text-muted)",
              background: renderMode === "iframe" ? "rgba(200,155,32,0.1)" : "none",
            }}
          >
            {renderMode === "iframe" ? "IFRAME" : "CANVAS"}
          </button>
          <button onClick={handleDownload} disabled={!activeDrawing?.file_url}
            style={{ ...toolBtn, ...mono, fontSize: 9, color: "var(--accent)", opacity: activeDrawing?.file_url ? 1 : 0.3 }}>
            ↓ PDF
          </button>

          {/* Scale indicator + auto-detect button. Shown only when a PDF is
              loaded. Reads activeDrawing.markup_scale; if null, shows "NO SCALE"
              + an AUTO button that parses the title block. */}
          {pdfDoc && (
            <>
              <div style={{ width: 1, height: 16, background: "var(--divider)", margin: "0 4px" }} />
              <span
                title={markupScale
                  ? `Calibrated scale (1 PDF inch = ${markupScale.toFixed(1)} real inches). Measurements render in real ft-in.`
                  : "No scale calibrated — measure tool shows raw page-inches with a ~ prefix."}
                style={{
                  ...mono, fontSize: 9, fontWeight: 700,
                  padding: "4px 8px",
                  borderRadius: 3,
                  background: markupScale ? "rgba(0,229,255,0.10)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${markupScale ? "rgba(0,229,255,0.45)" : "var(--border-default)"}`,
                  color: markupScale ? "#00E5FF" : "var(--text-muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                }}
              >
                {markupScale ? formatScaleFraction(markupScale) : "NO SCALE"}
              </span>
              <button
                onClick={handleAutoDetectScale}
                title="Scan the PDF title block and try to auto-detect the scale (K key opens the manual Calibrate tool if this fails)"
                disabled={!activeDrawing?.id}
                style={{
                  ...toolBtn, ...mono, fontSize: 9,
                  color: "var(--text-muted)",
                  opacity: activeDrawing?.id ? 1 : 0.4,
                }}
              >
                AUTO
              </button>
            </>
          )}
          <button
            onClick={() => setFilmstripOpen(o => !o)}
            title={filmstripOpen ? "Hide thumbnail filmstrip (F)" : "Show thumbnail filmstrip (F)"}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: filmstripOpen ? "var(--accent)" : "var(--text-muted)",
              background: filmstripOpen ? "rgba(200,155,32,0.10)" : "none",
            }}
          >
            <Film size={12} />
          </button>
          <button
            onClick={() => setContextOpen(o => !o)}
            title={contextOpen ? "Hide sheet context panel (I)" : "Show sheet context panel (I)"}
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: contextOpen ? "var(--accent)" : "var(--text-muted)",
              background: contextOpen ? "rgba(200,155,32,0.10)" : "none",
            }}
          >
            {contextOpen ? <PanelRightClose size={12} /> : <PanelRightOpen size={12} />}
          </button>
          <button
            onClick={() => setShortcutsOpen(o => !o)}
            title="Keyboard shortcuts (?)"
            style={{
              ...toolBtn,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "5px 8px",
              color: "var(--text-muted)",
            }}
          >
            <Keyboard size={12} />
            <span style={{ ...mono, fontSize: 9, fontWeight: 700 }}>?</span>
          </button>
        </div>

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
              OFF → VIEW (show saved zones) → DRAW (drag to create). Click
              cycles OFF↔VIEW; click+Alt to jump straight to DRAW. Left
              ghostly in the layout when we don't have a renderable sheet. */}
          {activeDrawing?.file_url && renderMode === "canvas" && !pdfError && (
            <div
              style={{
                position: "absolute",
                top: 10,
                right: 12,
                zIndex: 40,
                display: "flex",
                gap: 6,
                padding: 4,
                borderRadius: 6,
                background: "rgba(15,17,24,0.72)",
                border: "1px solid var(--border-default)",
                backdropFilter: "blur(6px)",
                fontFamily: "var(--font-mono)",
              }}
              title="Zones: rectangular coordination areas linked to RFIs / WPs / deliveries."
            >
              {[
                { id: "off",  label: "OFF",   desc: "Hide zone overlay" },
                { id: "view", label: `VIEW${filteredZones.length ? ` · ${filteredZones.length}` : ""}`, desc: "Show zones · click to select" },
                { id: "draw", label: "DRAW",  desc: "Drag-create a new zone" },
              ].map((btn) => {
                const isActive = zoneMode === btn.id;
                return (
                  <button
                    key={btn.id}
                    onClick={() => { setZoneMode(btn.id); setSelectedZoneId(null); }}
                    title={btn.desc}
                    style={{
                      padding: "5px 10px",
                      border: `1px solid ${isActive ? "#00E5FF" : "transparent"}`,
                      background: isActive
                        ? "rgba(0,229,255,0.14)"
                        : "transparent",
                      color: isActive ? "#00E5FF" : "var(--text-muted)",
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.10em",
                      cursor: "pointer",
                      textTransform: "uppercase",
                    }}
                  >
                    {btn.label}
                  </button>
                );
              })}
              {/* Heatmap overlay toggle — only useful when there are
                  zones to recolor. In VIEW mode it swaps the status
                  palette for a density-weighted cool→amber→red ramp so
                  hot zones on the sheet jump out at a glance. Hidden
                  in OFF + DRAW because there's nothing to recolor. */}
              {zoneMode === "view" && zones.length > 0 && (
                <button
                  onClick={() => setZoneOverlay((v) => (v === "heatmap" ? "status" : "heatmap"))}
                  title={zoneOverlay === "heatmap"
                    ? "Switch back to status colors"
                    : "Heatmap: recolor zones by weighted issue density (overdue RFIs, failed inspections, blocked WPs, late deliveries)"}
                  style={{
                    padding: "5px 10px",
                    border: `1px solid ${zoneOverlay === "heatmap" ? "#EF4444" : "transparent"}`,
                    background: zoneOverlay === "heatmap"
                      ? "rgba(239,68,68,0.14)"
                      : "transparent",
                    color: zoneOverlay === "heatmap" ? "#EF4444" : "var(--text-muted)",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    marginLeft: 4,
                  }}
                >
                  HEAT
                </button>
              )}

              {/* V3.1 — DEPS overlay toggle. Renders directed dependency
                  arrows between zones (red=blocks, amber=depends_on,
                  gray dashed=relates_to). Cross-sheet edges show as a
                  "→ Sheet X" pill instead of an arrow. Hidden in OFF
                  mode because there are no zone shapes to anchor
                  arrows to. */}
              {zoneMode !== "off" && (
                <button
                  onClick={() => setShowDeps((v) => !v)}
                  title={showDeps
                    ? "Hide dependency arrows"
                    : "Show directed dependency arrows between zones (V3.1)"}
                  style={{
                    padding: "5px 10px",
                    border: `1px solid ${showDeps ? "#F59E0B" : "transparent"}`,
                    background: showDeps
                      ? "rgba(245,158,11,0.14)"
                      : "transparent",
                    color: showDeps ? "#F59E0B" : "var(--text-muted)",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    marginLeft: 4,
                  }}
                >
                  DEPS
                </button>
              )}

              {/* Shape chooser — only relevant while DRAW is active.
                  Rectangle is fastest (drag) and polygon is for
                  irregular zones like erection bays or stair cores.
                  Hidden outside of DRAW mode to keep the toolbar quiet. */}
              {zoneMode === "draw" && (
                <div
                  role="group"
                  aria-label="Zone shape"
                  style={{
                    display: "flex",
                    gap: 4,
                    marginLeft: 4,
                    paddingLeft: 6,
                    borderLeft: "1px solid var(--border-default)",
                  }}
                  title="Shape to draw"
                >
                  {[
                    { id: "rect",    label: "▭", desc: "Rectangle — drag to create" },
                    { id: "polygon", label: "⬠", desc: "Polygon — click to add vertices, Enter/double-click to finish, Esc to cancel" },
                  ].map((s) => {
                    const isActive = drawShape === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setDrawShape(s.id)}
                        title={s.desc}
                        style={{
                          padding: "5px 8px",
                          border: `1px solid ${isActive ? "#00E5FF" : "transparent"}`,
                          background: isActive
                            ? "rgba(0,229,255,0.14)"
                            : "transparent",
                          color: isActive ? "#00E5FF" : "var(--text-muted)",
                          borderRadius: 3,
                          fontSize: 12,
                          lineHeight: 1,
                          cursor: "pointer",
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* V3.0 — Proposals drawer launcher. Always visible in
                  zone-mode so a PM can review AI-suggested zones without
                  needing to draw any zones first. Badge shows pending
                  count on this drawing. */}
              {activeDrawing && (
                <button
                  onClick={() => setProposalPanelOpen((v) => !v)}
                  title="Open the AI proposals drawer — zones suggested by clustering analyzer findings"
                  style={{
                    padding: "5px 10px",
                    border: `1px solid ${proposalPanelOpen ? "#00E5FF" : "transparent"}`,
                    background: proposalPanelOpen
                      ? "rgba(0,229,255,0.14)"
                      : pendingProposalCount > 0 ? "rgba(0,229,255,0.06)" : "transparent",
                    color: proposalPanelOpen || pendingProposalCount > 0 ? "#00E5FF" : "var(--text-muted)",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    marginLeft: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  PROPOSALS
                  {pendingProposalCount > 0 && (
                    <span style={{
                      ...mono,
                      fontSize: 9,
                      padding: "1px 5px",
                      borderRadius: 8,
                      background: "#00E5FF",
                      color: "#0F1118",
                    }}>
                      {pendingProposalCount}
                    </span>
                  )}
                </button>
              )}

              {/* Revision carry-forward — only offered when there's at
                  least one zone to carry. Invisible on a brand-new
                  sheet so the chrome stays quiet. */}
              {currentRevision && zones.length > 0 && (
                <button
                  onClick={handleNewRevision}
                  title={`Create a new revision of ${activeDrawing?.sheet_number || "this sheet"} — zones will be copied forward.`}
                  style={{
                    padding: "5px 10px",
                    border: "1px dashed var(--accent)",
                    background: "transparent",
                    color: "var(--accent)",
                    borderRadius: 3,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.10em",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    marginLeft: 4,
                  }}
                >
                  + Rev
                </button>
              )}
            </div>
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
                {linkHotspots.length > 0 && (
                  <div ref={annotLayerRef} style={{ position: "absolute", top: 0, left: 0, width: canvasRef.current?.width || 0, height: canvasRef.current?.height || 0, pointerEvents: "none" }}>
                    {linkHotspots.map(a => (
                      <div
                        key={a.id}
                        onClick={() => handleAnnotationClick(a)}
                        title={a.title || a.url || "Link"}
                        style={{
                          position: "absolute",
                          left: a.left,
                          top: a.top,
                          width: a.width,
                          height: a.height,
                          cursor: "pointer",
                          pointerEvents: "auto",
                          border: "1px solid transparent",
                          borderRadius: 2,
                          transition: "border-color 0.15s, background 0.15s",
                          background: "transparent",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(200,155,32,0.12)"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
                      />
                    ))}
                  </div>
                )}

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
                {Array.isArray(activeDrawing?.callouts) && activeDrawing.callouts.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0, left: 0,
                      width:  pageSize.width  * zoom,
                      height: pageSize.height * zoom,
                      pointerEvents: "none",
                    }}
                  >
                    {activeDrawing.callouts.map((c, i) => {
                      if (!c?.coords) return null;
                      // Render-time resolution against the full project drawing
                      // list — a callout flagged `resolved: false` at upload
                      // time may still hit a sibling uploaded later.
                      const match = drawings.find(d =>
                        normalizeSN(d.sheet_number) === normalizeSN(c.targetSheetNumber)
                      );
                      const resolved = !!match;
                      return (
                        <button
                          key={i}
                          disabled={!resolved}
                          onClick={() => resolved && onCalloutClick(c)}
                          title={resolved
                            ? `${c.text} → ${match.sheet_number}${match.title ? ` · ${match.title}` : ""}`
                            : `${c.text} (no sibling sheet found)`
                          }
                          style={{
                            position: "absolute",
                            left:   Math.max(0, c.coords.x      * zoom - 2),
                            top:    Math.max(0, c.coords.y      * zoom - 2),
                            width:  Math.max(12, c.coords.width  * zoom + 4),
                            height: Math.max(12, c.coords.height * zoom + 4),
                            background: resolved ? "rgba(200,155,32,0.18)" : "rgba(255,200,0,0.05)",
                            border: resolved ? "2px solid var(--accent)" : "2px dashed rgba(200,155,32,0.35)",
                            borderRadius: 2,
                            cursor: resolved ? "pointer" : "not-allowed",
                            pointerEvents: "auto",
                            padding: 0,
                            zIndex: 5,
                          }}
                        />
                      );
                    })}
                  </div>
                )}
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
