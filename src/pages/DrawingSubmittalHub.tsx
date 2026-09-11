/**
 * DrawingSubmittalHub — Unified Drawings & Submittals command center.
 *
 * Three+ tabs:
 *   Control Board / Process Board / Drawing Register (embedded) /
 *   Submittal Register (embedded) / Approval Matrix.
 *
 * This is a thin orchestrator. The existing pages render inside tab panels
 * and keep all their internal state / queries. The hub adds a unified KPI
 * strip, a shared CommandBar with tab navigation, and the Approval Matrix.
 */

import { Suspense, useMemo, useRef, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useDrawings } from "@/hooks/useDrawings";
import { useSubmittals } from "@/hooks/useSubmittals";
import { activeHoldCount, useDrawingHolds } from "@/hooks/useDrawingHolds";
import type { DrawingHoldRow } from "@/hooks/useDrawingHolds";
import { useTransmittals } from "@/hooks/useTransmittals";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { toast } from "sonner";
import ErrorBoundaryRaw from "@/components/shared/ErrorBoundary";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import { computeFabReady } from "@/lib/submittalAnalytics";
import { computeDetailingReadiness } from "@/lib/detailingReadiness";
import { summarizeElementStatuses } from "@/services/modelElementStatus";
import { countModelElements, fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";
import { computeRevisionImpact } from "@/lib/detailingRevisionImpact";
import { DEFAULT_LEAD_DAYS, resolveLeadDays } from "@/lib/detailingSchedule";
import { invalidateEntity } from "@/services/cacheRegistry";
import { usePermissions } from "@/services/permissions";
import { Box, CalendarCog } from "lucide-react";
import { useFlag } from "@/hooks/useFeatureFlag";
import EscalateModal from "./drawingSubmittalHub/EscalateModal";
import type { EscalationKind } from "./drawingSubmittalHub/EscalateModal";
import { DetailingCommandShell, DetailingNoProject } from "./drawingSubmittalHub/DetailingCommandShell";
import ModelElementImportModalRaw from "@/components/drawings/ModelElementImportModal";
import {
  TABS,
  buildCurrentRevisionMap,
  buildDrawingKpis,
  buildSequenceReadiness,
  buildSetPackages,
  buildTriage,
  dueDateWriteTargets,
  validateDetailingStateWrite,
  validateDueDateWrite,
} from "./drawingSubmittalHub/format";
import type { Drawing as HubDrawing, DrawingRevision as HubDrawingRevision, DrawingSet as HubDrawingSet, Submittal as HubSubmittal } from "./drawingSubmittalHub/types";
import { FleetHealthStrip, LeadTimesModal } from "./drawingSubmittalHub/components";
import ControlBoardPanel from "./drawingSubmittalHub/ControlBoardPanel";
import DrawingRegisterPanel from "./drawingSubmittalHub/DrawingRegisterPanel";
import RevisionImpactPanel from "./drawingSubmittalHub/RevisionImpactPanel";
import { ApprovalMatrixPanel } from "./drawingSubmittalHub/ApprovalMatrixPanel";
import type { HoldsStatus } from "./drawingSubmittalHub/ApprovalMatrixPanel";
import { calculateDrawingHealthScore, summarizeFleetHealth } from "@/services/drawingHealthScore";
import { buildRevisionImpactRows } from "@/lib/revisionImpactBoard";
import RevisionSummaryCard from "@/components/drawings/RevisionSummaryCard";
import { buildRevisionSummary } from "@/lib/revisionSummary";
import { saveRevisionSummary, getLatestSummariesByProject } from "@/lib/revisionSummaryRepo";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { buildRfiPrefillFromSummary, createRfiAndLink } from "@/lib/rfiFromDelta";
import { isRfiOpen } from "@/lib/entityPredicates";
import { normNum } from "@/lib/fabReleaseGate";
const RevisionDeepDiveModal = lazyWithRetry(() => import("@/components/drawings/RevisionImpactReportModal"));

// Lazy-load the existing pages as tab content — use lazyWithRetry so stale-
// chunk 404s after a deploy trigger a reload instead of a hard crash.
const SubmittalsPage = lazyWithRetry(() => import("@/pages/Submittals"));
// Heavy tab panels — each only renders on its own tab, so code-split them off
// the hub's route chunk. They already mount conditionally inside the <Suspense>
// boundary below, so deferring the import is behavior-preserving.
const ProcessBoardPanel = lazyWithRetry(
  () => import("@/components/submittals/ProcessBoardPanel"),
) as unknown as ComponentType<AnyProps>;
const DocControlPanel = lazyWithRetry(() =>
  import("@/components/drawings/register/DocControlPanel").then((m) => ({
    default: m.DocControlPanel,
  })),
) as unknown as ComponentType<AnyProps>;
// 2026 hub layout: surface the existing canonical workflows as first-level tabs.
const HoldsPanel = lazyWithRetry(() => import("@/components/drawings/register/HoldsPanel").then(m => ({ default: m.HoldsPanel })));
const TransmittalLogPanel = lazyWithRetry(() => import("@/components/drawings/register/TransmittalLogPanel").then(m => ({ default: m.TransmittalLogPanel })));
const DetailingValidationPanel = lazyWithRetry(() => import("@/pages/drawingSubmittalHub/DetailingValidationPanel"));
// Overlay compare carries pdfjs — keep it off the hub's route chunk.
const RevisionCompareModalLazy = lazyWithRetry(
  () => import("@/components/drawings/RevisionCompareModal"),
) as unknown as ComponentType<AnyProps>;
// 3D remains out of the normal Detailing path; its interaction subsystem is loaded
// separately, web-ifc stays a second-level dynamic import, and the feature is
// already guarded by the feature flag.
const Model3DTab = lazyWithRetry(
  () => import("@/components/viewer3d/Model3DTab")
);

// The design-system primitives + these shared screens are still .jsx; cast
// at the boundary (removable once the shared layer is typed).
type AnyProps = PropsWithChildren<Record<string, any>>;
const ErrorBoundary = ErrorBoundaryRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const ModelElementImportModal = ModelElementImportModalRaw as unknown as ComponentType<AnyProps>;

// Tabs whose count is a warning, not a row tally (header badge's twin).
const ALERT_TABS = ["holds"] as const;
const NO_HOLDS: DrawingHoldRow[] = [];
// One-shot record/create params, each aimed at a specific tab (Submittals:
// recordId, targetSetId, prefilled*; Transmittals: transmittal).
const HUB_RECORD_PARAMS = ["recordId", "targetSetId", "prefilledStatus", "prefilledBallInCourt", "transmittal"] as const;

/**
 * Route entry. With no project every query below is disabled, so the shell
 * used to sit on "—" and "Loading…" forever; now it says so plainly. Keyed
 * on the project so a switch remounts the hub — open drafts (escalation, RFI
 * from a summary, revision compare, lead times) never carry across projects.
 */
export default function DrawingSubmittalHub() {
  const projectCtx = useProjectContext() as any;
  const projectId = projectCtx.activeProject?.id as string | undefined;
  if (!projectId) return projectCtx.loading ? <LoadingSkeleton /> : <DetailingNoProject />;
  return <DetailingControlCenter key={projectId} />;
}

function DetailingControlCenter() {
  const projectCtx = useProjectContext() as any;
  const activeProject = projectCtx.activeProject as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  // Contextual escalation (Critical Work Queue / Next Decision → draft RFI / PCO)
  const [escalateItem, setEscalateItem] = useState<any | null>(null);
  const [escalateKind, setEscalateKind] = useState<EscalationKind>("rfi");
  // Revision overlay compare (Revision Impact rows)
  const [compareDrawingId, setCompareDrawingId] = useState<string | null>(null);
  const [importModelOpen, setImportModelOpen] = useState(false);
  const [summaryCard, setSummaryCard] = useState<any | null>(null);
  const [deepDiveSet, setDeepDiveSet] = useState<any | null>(null);
  const [rfiDraft, setRfiDraft] = useState<any | null>(null);
  const [savingRfi, setSavingRfi] = useState(false);
  const summaryInFlight = useRef(new Set<string>());
  const qc = useQueryClient();
  const { can } = usePermissions();
  const projectId = activeProject?.id as string | undefined;
  const projectName = activeProject?.name || activeProject?.project_number || "";
  const projectLabel = [activeProject?.project_number, activeProject?.name].filter(Boolean).join(" · ");

  // The 3D model viewer is flag-gated until verified against real models in prod.
  const show3d = useFlag("viewer_3d");
  // Phase 5 display: count SUBMITTAL due-date countdowns in working days (Mon–Fri)
  // rather than calendar days when on. Drawing-set dues stay calendar-day. Threaded
  // as a param into the pure formatters (buildTriage / buildApprovalMatrixRows) and
  // as a prop into the submittal boards — pure fns never read the flag directly.
  const workdayDues = useFlag("submittal_workday_dues");
  const tabs = useMemo(
    () => (show3d ? [...TABS, { key: "model3d", label: "3D Model", icon: Box }] : TABS),
    [show3d],
  );

  // Tab state from URL (persistent across navigation)
  const tabParam = searchParams.get("hub_tab") || "overview";
  const activeTab = tabs.find((t) => t.key === tabParam) ? tabParam : "overview";
  // Tab changes PUSH a history entry (the 2026 hub keeps its tab in the path
  // for the same reason), so Back returns to the previous tab instead of
  // leaving the hub. ?hub_tab= stays the format, so old bookmarks and the
  // Validation panel's ?hub_tab=holds link keep working. The matrix's quick
  // filter is tab-scoped and doesn't follow the user to another tab.
  const setActiveTab = (key: string) => {
    if (key === activeTab) return;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("hub_tab", key);
      if (key !== "matrix") next.delete("matrix_filter");
      // A ?projectId= / ?project= deep link has done its job once
      // ProjectScopedRoute synced the project. Pushed entries must not re-pin
      // it, or Back after a project switch would quietly switch the app back.
      next.delete("projectId");
      next.delete("project");
      // A lazy tab that hadn't consumed its record param yet must not fire it
      // later, on some other visit.
      for (const param of HUB_RECORD_PARAMS) next.delete(param);
      return next;
    });
  };

  // ── Data for KPI strip & matrix ────────────────────────────────────────
  const { drawings, isLoading: drawingsLoading } = useDrawings(projectId);
  const {
    submittals, kpis, roundsBySubmittal,
    isLoading: submittalsLoading,
  } = useSubmittals(projectId);

  // Drawing sets (for matrix)
  const { data: drawingSets = [], isPending: drawingSetsLoading } = useQuery({
    queryKey: ["drawing-sets", projectId],
    queryFn: () => entities.DrawingSet.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // Holds: one query feeds the header badge, the Holds tab count and the
  // matrix's On Hold column — the same key HoldsPanel reads, so all agree.
  // "Known" means we HAVE rows. A failed background refetch keeps its cached
  // rows (TanStack v5: status "error" with data), and those last-known values
  // stay on screen — flipping cells to "?" while the hold filter still matched
  // the same cached rows contradicted itself.
  const holdsQuery = useDrawingHolds(projectId ?? null);
  const holds = holdsQuery.data ?? NO_HOLDS;
  const holdsStatus: HoldsStatus = holdsQuery.data !== undefined ? "ready" : holdsQuery.isError ? "error" : "loading";
  const activeHolds = holdsStatus === "ready" ? activeHoldCount(holds) : null;
  // The matrix's Last Transmittal column. It's a three-table read, so it
  // loads only while the matrix is open (same key as the Transmittals tab).
  const { data: transmittals, isPending: transmittalsPending } = useTransmittals(projectId ?? null, {
    enabled: activeTab === "matrix",
  });

  // Work packages (for the erection sequence date → backward scheduling) + RFIs
  // (to know which linked RFIs are still open → rfiBlocked readiness).
  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => entities.WorkPackage.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => entities.RFI.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const { data: drawingRevisions = [], isPending: revisionsLoading } = useQuery({
    queryKey: ["drawing-revisions", projectId],
    queryFn: () => entities.DrawingRevision.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  // Latest persisted Revision Summary per set → the "revised · N" badge + re-open.
  const { data: summariesBySet = new Map() } = useQuery({
    queryKey: ["revision-summaries", projectId],
    queryFn: () => getLatestSummariesByProject(projectId as string),
    enabled: !!projectId && activeTab === "drawings",
    staleTime: 60_000,
  });
  // ── 3D model members (BIM integration Phase 0 — piece-mark mapping) ──────
  // Read in TWO parts, deliberately.
  //
  // (1) A HEAD count: one request, zero rows transferred, always enabled. This
  // is what the Control Board's mapping card reads to know whether a roster
  // exists. It previously inferred that from the roster array itself — which is
  // gated to the 3D tab — so on a project with 27k imported members the card
  // told the user "No model members yet, import a CSV from Tekla or SDS2".
  const { data: modelElementCount = null, isPending: modelElementCountLoading } = useQuery({
    queryKey: ["model-elements-count", projectId],
    queryFn: () => countModelElements(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // (2) The full roster, which stays LAZY. Big models run 3k–28k+ elements and a
  // single Supabase request is capped at 1000 rows server-side (db-max-rows), so
  // fetchAllModelElements pages with .range() — ~28 round-trips on the largest
  // live project. That cost is why it loads only where it is actually rendered:
  // the 3D tab, or when the user opens the mapping card on the Control Board.
  const [mappingRosterRequested, setMappingRosterRequested] = useState(false);
  const { data: modelElements = [], isFetching: modelElementsLoading, error: modelElementsError } = useQuery({
    queryKey: ["model-elements", projectId],
    queryFn: () => fetchAllModelElements(projectId),
    enabled: !!projectId && ((show3d && activeTab === "model3d") || mappingRosterRequested),
    staleTime: 60_000,
  });

  const setPackages = useMemo(
    // The hub-local Drawing/Submittal interfaces and the hooks' DB-row types
    // describe the same runtime rows; reconcile the two parallel shapes at the
    // boundary (behavior-preserving — no value is changed).
    () => buildSetPackages(drawings as unknown as HubDrawing[], drawingSets as unknown as HubDrawingSet[], submittals as unknown as HubSubmittal[]),
    [drawings, drawingSets, submittals]
  );

  // Authoritative per-drawing current revision (§20-21): drawing_id → {code,
  // version} from drawing_revisions WHERE is_current=true. The Drawing Register's
  // "Rev" column reads THIS (matching Doc Control) instead of the deprecated,
  // drift-prone drawings.revision_number string.
  const currentRevByDrawingId = useMemo(
    () => buildCurrentRevisionMap(drawingRevisions as unknown as HubDrawingRevision[]),
    [drawingRevisions]
  );

  // Per-set Drawing Health Score (slice 2) — deterministic; feeds the Register
  // Health column + the Control Board fleet rollup.
  const healthByKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const pkg of setPackages) {
      m.set(pkg.key, calculateDrawingHealthScore(pkg, { rfis: rfis as any[], revisions: drawingRevisions as any[] }));
    }
    return m;
  }, [setPackages, rfis, drawingRevisions]);
  const fleetHealth = useMemo(() => summarizeFleetHealth([...healthByKey.values()]), [healthByKey]);

  // Revision Summary (slice 3): on upload, build the instant digest from fresh
  // revisions + the current package (downstream dates are stable on a revision
  // upload), persist a snapshot, and show the card. AI deep-dive stays on demand.
  const aiDiff = useFlag("revision_ai_diff");
  const handleRevisionUploaded = async (pkgKey: string) => {
    if (!projectId || summaryInFlight.current.has(pkgKey)) return;
    summaryInFlight.current.add(pkgKey);
    try {
      await Promise.all([
        invalidateEntity(qc, "drawing_revision", projectId),
        invalidateEntity(qc, "drawingSet", projectId),
      ]);
      const freshRevisions = await qc.fetchQuery({
        queryKey: ["drawing-revisions", projectId],
        queryFn: () => entities.DrawingRevision.filter({ project_id: projectId }),
      });
       
      const pkg = setPackages.find((p: any) => p.key === pkgKey);
      if (!pkg) {
        toast.warning("Revision uploaded, but its summary could not be generated because the set is no longer visible.");
        return;
      }
      let summary: any;
      try {
        summary = buildRevisionSummary({
          set: pkg,
          revisions: freshRevisions as any[],
          rfis: rfis as any[],
          drawingSets: drawingSets as any[],
          workPackages: workPackages as any[],
          modelElements: modelElements as any[],
        });
      } catch (err) {
        console.warn("[revision-summary] generation failed:", err);
        toast.warning("Revision uploaded, but the revision summary could not be generated.");
        return;
      }
      setSummaryCard(summary);
      try {
        await saveRevisionSummary({ projectId, drawingSetId: pkg.setId, summary, generatedBy: null });
        await invalidateEntity(qc, "drawing_revision", projectId);
        await invalidateEntity(qc, "drawingSet", projectId);
        await qc.invalidateQueries({ queryKey: ["revision-summaries", projectId] });
      } catch (err) {
        console.warn("[revision-summary] persistence failed:", err);
        toast.warning("Revision uploaded and summary shown, but the summary could not be saved.");
      }
    } catch (err) {
      console.warn("[revision-summary] refresh failed:", err);
      toast.warning("Revision uploaded, but the revision summary could not be refreshed.");
    } finally {
      summaryInFlight.current.delete(pkgKey);
    }
  };
   
  const openDeepDive = (summary: any) => {
     
    const pkg = setPackages.find((p: any) => String(p.setId) === String(summary?.setId));
    setSummaryCard(null);
    if (pkg) setDeepDiveSet(pkg);
  };
  // Create an RFI pre-filled from the deterministic summary (no AI diff needed);
  // the user reviews/edits it in RFIFormModal before it is saved.
   
  const openRfiFromSummary = (summary: any) => {
    setSummaryCard(null);
    setRfiDraft({ prefill: buildRfiPrefillFromSummary(summary) });
  };
   
  const saveRfiFromSummary = async (formData: any) => {
    setSavingRfi(true);
    try {
      const created = await createRfiAndLink({ projectId, formData, deltaId: undefined });
      setRfiDraft(null);
      toast.success(`Created ${created?.rfi_number || "RFI"} from revision summary`);
      await invalidateEntity(qc, "rfi", projectId);
    } catch (err: any) {
      toast.error("Failed to create RFI: " + (err?.message || "Unknown"));
    } finally {
      setSavingRfi(false);
    }
  };

  // Lookup maps for readiness: WP by id, and the set of OPEN rfi ids.
  const wpById = useMemo(() => {
    const m = new Map<string, any>();
    for (const wp of (workPackages as any[]) || []) {
      if (wp && !wp.is_deleted && wp.id) m.set(String(wp.id), wp);
    }
    return m;
  }, [workPackages]);

  const openRfiIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of (rfis as any[]) || []) {
      if (r && !r.is_deleted && r.id && isRfiOpen(r)) s.add(String(r.id));
    }
    return s;
  }, [rfis]);

  // The SAME open RFIs keyed by normalized NUMBER. Sheet links live in
  // drawings.linked_rfi_ids, which is a CSV of RFI numbers ("RFI #001"), not
  // uuids — readiness needs the open set in both shapes or a sheet-linked open
  // RFI silently fails to block the package.
  const openRfiNumbers = useMemo(() => {
    const s = new Set<string>();
    for (const r of (rfis as any[]) || []) {
      if (!r || r.is_deleted || !isRfiOpen(r)) continue;
      const key = normNum(r.rfi_number);
      if (key) s.add(key);
    }
    return s;
  }, [rfis]);

  // Per-package readiness read-model, keyed by package key.
  const readinessByKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const pkg of setPackages) {
      const wpIds: string[] = Array.isArray((pkg.parent as any)?.linked_work_package_ids)
        ? (pkg.parent as any).linked_work_package_ids
        : [];
      // earliest-starting linked WP is the most constraining erection date
      let workPackage: any = null;
      for (const id of wpIds) {
        const wp = wpById.get(String(id));
        if (!wp) continue;
        if (!workPackage || (wp.scheduled_start_date && (!workPackage.scheduled_start_date || wp.scheduled_start_date < workPackage.scheduled_start_date))) {
          workPackage = wp;
        }
      }
      m.set(pkg.key, computeDetailingReadiness({
        pkg: pkg.parent,
        submittals: pkg.submittals,
        sheets: pkg.sheets,
        supersededSheets: pkg.supersededSheets,
        project: activeProject,
        workPackage,
        openRfiIds,
        openRfiNumbers,
      }));
    }
    return m;
  }, [setPackages, wpById, openRfiIds, openRfiNumbers, activeProject]);

  // 3D model mapping rollup: element status buckets derived from the SAME
  // per-package readiness models above, so the (future) viewer coloring can
  // never disagree with the hub numbers. Elements resolve to a package via
  // their drawing_set link, or via their sheet's package.
  const modelMappingSummary = useMemo(() => {
    const readinessBySetId = new Map<string, any>();
    const sheetSetIdByDrawingId = new Map<string, string>();
    for (const pkg of setPackages) {
      const r: any = readinessByKey.get(pkg.key);
      if (!r) continue;
      const enriched = { ...r, atRisk: r.scheduleRisk?.atRisk };
      const target = pkg.setId ? String(pkg.setId) : pkg.key;
      readinessBySetId.set(target, enriched);
      if (pkg.setId) readinessBySetId.set(pkg.key, enriched);
      for (const s of (pkg.sheets as any[]) || []) {
        if (s?.id) sheetSetIdByDrawingId.set(String(s.id), target);
      }
    }
    return summarizeElementStatuses(modelElements as any[], readinessBySetId, sheetSetIdByDrawingId);
  }, [modelElements, setPackages, readinessByKey]);

  // Revision Impact Tracker: change-revisions joined to their sheet's downstream
  // status (fabricated / delivered / in-field), worst impact first.
  const revisionImpact = useMemo(() => {
    const drawingsById = new Map<string, any>();
    for (const d of (drawings as any[]) || []) {
      if (d && d.id) drawingsById.set(String(d.id), d);
    }
    return computeRevisionImpact({ revisions: drawingRevisions as any[], drawingsById });
  }, [drawings, drawingRevisions]);

  // Slice 4 — enrich each change-revision for the Revision Impact board (set,
  // work package, linked RFIs, fab-blocked, affected pieces). Logic + tests live
  // in src/lib/revisionImpactBoard.ts.
  const revisionImpactRows = useMemo(
    () => buildRevisionImpactRows(revisionImpact as any[], {
      drawings: drawings as any[],
      drawingSets: drawingSets as any[],
      workPackages: workPackages as any[],
      rfis: rfis as any[],
      modelElements: modelElements as any[],
    }),
    [revisionImpact, drawings, drawingSets, workPackages, rfis, modelElements],
  );

  // Sheet selected for the revision overlay compare (Revision Impact rows).
  const compareDrawing = useMemo(
    () => ((drawings as any[]) || []).find((d: any) => String(d?.id) === String(compareDrawingId)) || null,
    [drawings, compareDrawingId],
  );

  // Escalation is gated by create permission on either target entity; the
  // modal itself disables whichever kind the user can't create.
  const canEscalate = can("create", "rfi") || can("create", "change_order");

  // Inline Control-Board edits touch drawing_sets / drawings / submittals, whose
  // RLS UPDATE policies all floor at project role "field". Without this gate a
  // project VIEWER saw fully enabled owner / due-date / state / readiness
  // controls and only learned they could not use them from an RLS rejection
  // toast. The entity overrides make can("edit", …) mirror the DB exactly.
  const canEditDetailing =
    can("edit", "drawing_set") || can("edit", "drawing") || can("edit", "submittal");

  // Sequence-aware readiness rollup (group packages by erection sequence).
  const sequenceReadiness = useMemo(() => buildSequenceReadiness(readinessByKey), [readinessByKey]);

  // ── Drawing KPIs ───────────────────────────────────────────────────────
  const drawingKpis = useMemo(() => buildDrawingKpis(drawings, setPackages), [drawings, setPackages]);

  // ── Fab-Ready KPI ──────────────────────────────────────────────────────
  const fabReady = useMemo(
    () => computeFabReady(drawings, submittals),
    [drawings, submittals]
  );

  const isLoading = drawingsLoading || submittalsLoading;

  const triage = useMemo(
    () => buildTriage(submittals, setPackages, readinessByKey, workdayDues),
    [submittals, setPackages, readinessByKey, workdayDues],
  );

  // A tab badge must count the ROWS that tab lists. The Drawing Register tab
  // renders sheets (DrawingRegisterGridPanel), so badging it with the set count
  // read "Drawing Register 11" above 148 rows.
  const tabCounts = useMemo(() => ({
    overview: triage.openItems.length,
    process: setPackages.length + triage.unlinkedSubmittalItems.length,
    drawings: drawingKpis.totalSheets,
    submittals: kpis.total,
    matrix: drawingSets.filter((set) => !set?.is_deleted).length,
    holds: activeHolds ?? 0,
  }), [triage.openItems.length, triage.unlinkedSubmittalItems.length, setPackages.length, drawingKpis.totalSheets, kpis.total, drawingSets, activeHolds]);

  // ── Inline quick-action mutations (Next Decision card) ────────────────
  const invalidateHub = async () => {
    // Sets read under both "drawing-sets" (hub) and "drawing_sets" (Drawings/
    // Submittals) keys — invalidate both spellings + the register view so a hub
    // edit reflects everywhere (and vice-versa).
    await Promise.all([
      invalidateEntity(qc, "drawingSet", projectId),
      invalidateEntity(qc, "drawing", projectId),
      invalidateEntity(qc, "submittal", projectId),
    ]);
  };

  const updateOwnerMut = useMutation({
    mutationFn: async ({ item, owner }: { item: any; owner: string }) => {
      if (item._submittalId) {
        await entities.Submittal.update(item._submittalId, { ball_in_court: owner });
      } else if (item._ownerScope === "First sheet owner" && item._firstSheetId) {
        // `drawings` has no assigned_to (nor ball_in_court) column — only
        // `reviewer`. The `as any` here was hiding a guaranteed PGRST204: this
        // control could never succeed, it only ever produced a red toast.
        await entities.Drawing.update(item._firstSheetId, { reviewer: owner });
      } else {
        throw new Error("No package-level owner field exists; assign the first sheet instead.");
      }
    },
    onSuccess: async (_data, { owner }) => {
      await invalidateHub();
      toast.success(`Owner assigned: ${owner}`);
    },
    onError: (err) => toast.error("Failed to assign owner: " + (err?.message || "Unknown")),
  });

  const updateDueDateMut = useMutation({
    mutationFn: async ({ item, date }: { item: any; date: string }) => {
      const dueDateError = validateDueDateWrite(item, date);
      if (dueDateError) throw new Error(dueDateError);
      // dueDateWriteTargets (format.ts, unit-tested) is the single source of truth
      // for the submittal-vs-sheets dispatch — the mutation just executes its result.
      const targets = dueDateWriteTargets(item);
      if ("submittalId" in targets) {
        await entities.Submittal.update(targets.submittalId, { required_date: date });
      } else {
        // For drawing-set packages (no linked submittal), write to ALL sheets so
        // earliestDate() picks up the change regardless of fetch order. Writing
        // only sheets[0] left the displayed date stale when sheets[0] wasn't the
        // sheet earliestDate() was returning.
        const ids = targets.sheetIds.length
          ? targets.sheetIds
          : item._firstSheetId ? [item._firstSheetId] : [];
        if (!ids.length) throw new Error("No entity available to set due date");
        // Identical { due_date } across every sheet in the package → one chunked
        // .in('id', ids) update instead of N single-row round-trips.
        await entities.Drawing.bulkUpdate(ids, { due_date: date });
      }
    },
    onSuccess: async () => {
      await invalidateHub();
      toast.success("Due date set");
    },
    onError: (err) => toast.error("Failed to set due date: " + (err?.message || "Unknown")),
  });

  // Advance the manual detailing (drafting/release) state on a drawing set.
  // Only meaningful when no submittal governs the package (the submittal
  // machine owns the middle of the flow); the UI gates the control accordingly.
  const updateDetailingStateMut = useMutation({
    mutationFn: async ({ item, next }: { item: any; next: string }) => {
      const stateError = validateDetailingStateWrite(item, next);
      if (stateError) throw new Error(stateError);
      await entities.DrawingSet.update(item._drawingSetId, { detailing_state: next } as any);
    },
    onSuccess: async (_data, { next }) => {
      await invalidateHub();
      toast.success(`Detailing state → ${next}`);
    },
    onError: (err) => toast.error("Failed to set detailing state: " + (err?.message || "Unknown")),
  });

  // Toggle a manual readiness flag (material_impacted / long_lead_impact).
  const updateReadinessFlagMut = useMutation({
    mutationFn: async ({ item, field, value }: { item: any; field: "material_impacted" | "long_lead_impact"; value: boolean }) => {
      if (!item?._drawingSetId) throw new Error("No drawing set to update");
      await entities.DrawingSet.update(item._drawingSetId, { [field]: value } as any);
    },
    onSuccess: async (_data, { field, value }) => {
      await invalidateHub();
      const label = field === "material_impacted" ? "Material impacted" : "Long-lead impact";
      toast.success(`${label} ${value ? "flagged" : "cleared"}`);
    },
    onError: (err) => toast.error("Failed to update readiness flag: " + (err?.message || "Unknown")),
  });

  // Save per-project lead-time defaults into projects.metadata.detailing_lead_days.
  // Updates the context's activeProject too, so the backward dates recompute live.
  const saveLeadsMut = useMutation({
    mutationFn: async (leads: Record<string, number>) => {
      if (!projectId) throw new Error("No active project");
      const nextMetadata = { ...(activeProject?.metadata || {}), detailing_lead_days: leads };
      await entities.Project.update(projectId, { metadata: nextMetadata } as any);
      return nextMetadata;
    },
    onSuccess: (nextMetadata) => {
      projectCtx.updateActiveProject?.({ metadata: nextMetadata });
      setLeadModalOpen(false);
      toast.success("Lead times updated");
    },
    onError: (err) => toast.error("Failed to save lead times: " + (err?.message || "Unknown")),
  });

  // ── Shared tab-panel renderer ─────────────────────────────────────────
  // The canonical shell owns the presentation; this renderer keeps each
  // workflow tab isolated behind the shared loading and error boundaries.
  const activeTabPanel = (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSkeleton />}>
        {activeTab === "overview" && (
          <>
          <FleetHealthStrip fleet={fleetHealth} onOpenRegister={() => setActiveTab("drawings")} />
          <ControlBoardPanel
            triage={triage}
            kpis={kpis}
            drawingKpis={drawingKpis}
            isLoading={isLoading}
            onOpenTab={setActiveTab}
            onUpdateOwner={canEditDetailing ? (item: any, owner: string) => updateOwnerMut.mutate({ item, owner }) : undefined}
            onUpdateDueDate={canEditDetailing ? (item: any, date: string) => updateDueDateMut.mutate({ item, date }) : undefined}
            onAdvanceDetailing={canEditDetailing ? (item: any, next: string) => updateDetailingStateMut.mutate({ item, next }) : undefined}
            onToggleReadiness={canEditDetailing ? (item: any, field: "material_impacted" | "long_lead_impact", value: boolean) => updateReadinessFlagMut.mutate({ item, field, value }) : undefined}
            sequenceReadiness={sequenceReadiness}
            revisionImpact={revisionImpact}
            isSaving={updateOwnerMut.isPending || updateDueDateMut.isPending || updateDetailingStateMut.isPending || updateReadinessFlagMut.isPending}
            onEscalate={canEscalate ? (item: any, kind: EscalationKind) => { setEscalateItem(item); setEscalateKind(kind); } : undefined}
            onCompareRevision={(drawingId: string) => setCompareDrawingId(drawingId)}
            modelMapping={modelMappingSummary}
            modelElementRows={modelElements as any[]}
            modelRosterCount={modelElementCount}
            modelRosterCountLoading={modelElementCountLoading}
            modelRosterLoading={modelElementsLoading}
            onLoadModelRoster={() => setMappingRosterRequested(true)}
            onImportModelElements={() => setImportModelOpen(true)}
          />
          </>
        )}
        {activeTab === "process" && (
          <ProcessBoardPanel
            setPackages={setPackages}
            submittals={submittals}
            isLoading={isLoading}
            onOpenTab={setActiveTab}
            useWorkdays={workdayDues}
          />
        )}
        {activeTab === "drawings" && (
          <DrawingRegisterPanel
            setPackages={setPackages}
            projectId={projectId}
            activeProject={activeProject}
            drawingSets={drawingSets}
            isLoading={isLoading}
            healthByKey={healthByKey}
            currentRevByDrawingId={currentRevByDrawingId}
            summariesBySet={summariesBySet}
            onRevisionUploaded={handleRevisionUploaded}
            onOpenSummary={setSummaryCard}
          />
        )}
        {activeTab === "submittals" && <SubmittalsPage embedded />}
        {activeTab === "matrix" && (
          <ApprovalMatrixPanel
            drawingSets={drawingSets}
            submittals={submittals as unknown as HubSubmittal[]}
            roundsBySubmittal={roundsBySubmittal}
            // drawingSets has its own query, so the matrix could render
            // "No drawing sets yet." while that key was still cold.
            isLoading={isLoading || drawingSetsLoading}
            useWorkdays={workdayDues}
            setPackages={setPackages}
            holds={holds}
            holdsStatus={holdsStatus}
            transmittals={transmittals}
            transmittalsLoading={transmittalsPending}
            canCreateSubmittal={can("create", "submittal")}
          />
        )}
        {activeTab === "revimpact" && (
          <RevisionImpactPanel
            rows={revisionImpactRows}
            onCompareRevision={(drawingId: string) => setCompareDrawingId(drawingId)}
            // Rows derive from drawingRevisions, which loads separately.
            isLoading={isLoading || revisionsLoading}
            // Lets the "Pieces ≈" column distinguish "nothing affected" from
            // "the roster wasn't loaded, so we didn't count".
            rosterLoaded={modelElements.length > 0}
          />
        )}
        {activeTab === "holds" && <HoldsPanel key={projectId} projectId={projectId || null} />}
        {activeTab === "transmittals" && <TransmittalLogPanel key={projectId} projectId={projectId || null} />}
        {activeTab === "validation" && <DetailingValidationPanel key={projectId} projectId={projectId || null} />}
        {activeTab === "doccontrol" && <DocControlPanel projectId={projectId} />}
        {activeTab === "model3d" && (
          <Model3DTab modelMapping={modelMappingSummary} modelElementRows={modelElements as any[]} projectId={projectId} rosterLoading={modelElementsLoading} rosterError={modelElementsError} />
        )}
      </Suspense>
    </ErrorBoundary>
  );

  // ── Shared modals ─────────────────────────────────────────────────────
  // These remain outside the shell's panel slot so portaled and non-portaled
  // dialogs keep their existing focus, audit, and workflow behavior.
  const sharedModals = (
    <>
      {leadModalOpen && (
        <LeadTimesModal
          leadDays={resolveLeadDays(activeProject, null)}
          defaults={DEFAULT_LEAD_DAYS}
          saving={saveLeadsMut.isPending}
          onSave={(leads) => saveLeadsMut.mutate(leads)}
          onClose={() => setLeadModalOpen(false)}
        />
      )}
      {escalateItem && (
        <EscalateModal
          item={escalateItem}
          initialKind={escalateKind}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setEscalateItem(null)}
        />
      )}
      {compareDrawing && (
        <Suspense fallback={null}>
          <RevisionCompareModalLazy
            open
            onClose={() => setCompareDrawingId(null)}
            drawing={compareDrawing}
          />
        </Suspense>
      )}
      {importModelOpen && (
        <ModelElementImportModal
          open
          projectId={projectId}
          projectName={projectName}
          drawings={drawings}
          // NO existingElements prop — the importer loads (and pages) the roster
          // itself. Passing this page's copy fed it [] on the Control Board and
          // every CSV row classified as "create", duplicating the whole roster.
          onClose={() => setImportModelOpen(false)}
        />
      )}
      {summaryCard && (
        <RevisionSummaryCard
          summary={summaryCard}
          onClose={() => setSummaryCard(null)}
          onRunDeepDive={aiDiff ? openDeepDive : undefined}
          onCreateRfi={can("create", "rfi") ? openRfiFromSummary : undefined}
        />
      )}
      {rfiDraft && (
        <RFIFormModal
          projectId={projectId}
          rfi={null}
          prefill={rfiDraft.prefill}
          saving={savingRfi}
          onClose={() => setRfiDraft(null)}
          onSave={saveRfiFromSummary}
        />
      )}
      {deepDiveSet && (
        <Suspense fallback={null}>
          <RevisionDeepDiveModal open onClose={() => setDeepDiveSet(null)} set={deepDiveSet} projectId={projectId} />
        </Suspense>
      )}
    </>
  );

  return (
    <>
      <ListTruncationNotice count={drawings.length} label="drawing sheets" />
      <DetailingCommandShell
        tabs={tabs}
        activeTab={activeTab}
        onTab={setActiveTab}
        kpis={{
          totalSets: drawingKpis.totalSets,
          totalSheets: drawingKpis.totalSheets,
          released: drawingKpis.released,
          inReview: drawingKpis.inReview,
          submittalsTotal: kpis.total,
          submittalsPending: kpis.pending,
          needsAction: kpis.rejected,
          overdue: triage.overdueDrawingSets,
          atRisk: triage.atRiskCount,
          overdueDrawingSets: triage.overdueDrawingSets,
          overdueUnlinkedSubmittals: triage.overdueUnlinkedSubmittals,
          fabReadyNumerator: fabReady.numerator,
          fabReadyDenominator: fabReady.denominator,
          fabReadyPercent: fabReady.percent,
          openItems: triage.openItems.length,
          fleetAverageScore: fleetHealth.count > 0 ? fleetHealth.averageScore : null,
        }}
        projectName={projectLabel}
        tabCounts={tabCounts}
        alertTabs={ALERT_TABS}
        activeHolds={activeHolds}
        isLoading={isLoading}
        // Lead Times is the ONLY writer of projects.metadata.detailing_lead_days,
        // which drives the whole backward schedule (Submit by / Approval by / Fab
        // release by) and the At-Risk badge. Its trigger was dropped in 307dafbfe
        // when the CommandBar header was replaced by this shell, leaving every
        // project silently pinned to DEFAULT_LEAD_DAYS with no way to change it.
        actions={can("edit", "project") ? (
          <button
            type="button"
            className="cmd-btn cmd-btn--ghost"
            onClick={() => setLeadModalOpen(true)}
            title="Set this project's detailing lead times (drives the backward schedule)"
          >
            <CalendarCog size={14} /> Lead Times
          </button>
        ) : undefined}
      >
        {activeTabPanel}
      </DetailingCommandShell>
      <div className="detailing-cc">{sharedModals}</div>
    </>
  );
}
