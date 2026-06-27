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

import { Suspense, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { lazyWithRetry } from "@/lib/lazyRetry";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useDrawings } from "@/hooks/useDrawings";
import { useSubmittals } from "@/hooks/useSubmittals";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { toast } from "sonner";
import ErrorBoundaryRaw from "@/components/shared/ErrorBoundary";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { CommandBar as CommandBarRaw, KpiTile as KpiTileRaw } from "@/components/design-system";
import { computeFabReady } from "@/lib/submittalAnalytics";
import { effectiveDetailingState, hasGoverningSubmittal, isPackageRR } from "@/lib/detailingPackageState";
import { computeDetailingReadiness, computeSequenceReadiness } from "@/lib/detailingReadiness";
import { summarizeElementStatuses } from "@/services/modelElementStatus";
import { fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";
import { computeRevisionImpact } from "@/lib/detailingRevisionImpact";
import { DEFAULT_LEAD_DAYS, resolveLeadDays } from "@/lib/detailingSchedule";
import { invalidateEntity } from "@/services/cacheRegistry";
import { usePermissions } from "@/services/permissions";
import { AlertTriangle, Box, CalendarClock, Gauge, Link2 } from "lucide-react";
import { useFlag } from "@/hooks/useFeatureFlag";
import { ModuleHeader } from "@/components/desktop/module";
import Model3DTab from "@/components/viewer3d/Model3DTab";
import EscalateModal from "./drawingSubmittalHub/EscalateModal";
import type { EscalationKind } from "./drawingSubmittalHub/EscalateModal";
import ModelElementImportModalRaw from "@/components/drawings/ModelElementImportModal";
import {
  ACTION_STATUSES,
  TABS,
  accent,
  border,
  buildCurrentRevisionMap,
  buildSetPackages,
  dueDateWriteTargets,
  dueInfo,
  earliestDate,
  error,
  getDrawingDueDate,
  getSubmittalDueDate,
  info,
  isClosedDrawing,
  isClosedPackage,
  isClosedSubmittal,
  itemUrgency,
  mono,
  review,
  rollupDrawingStage,
  success,
  surface2,
  textMuted,
  textPrimary,
  warning,
} from "./drawingSubmittalHub/format";
import type { Drawing as HubDrawing, DrawingRevision as HubDrawingRevision, DrawingSet as HubDrawingSet, Submittal as HubSubmittal } from "./drawingSubmittalHub/types";
import { ApprovalMatrix, DrawingRegisterTable, FleetHealthStrip, HeaderSignal, LeadTimesModal, RevisionImpactBoard, TriageBoard } from "./drawingSubmittalHub/components";
import { calculateDrawingHealthScore, summarizeFleetHealth } from "@/services/drawingHealthScore";
import { buildRevisionImpactRows } from "@/lib/revisionImpactBoard";
import RevisionSummaryCard from "@/components/drawings/RevisionSummaryCard";
import { buildRevisionSummary } from "@/lib/revisionSummary";
import { saveRevisionSummary, getLatestSummariesByProject } from "@/lib/revisionSummaryRepo";
import RFIFormModal from "@/components/rfis/RFIFormModal";
import { buildRfiPrefillFromSummary, createRfiAndLink } from "@/lib/rfiFromDelta";
import { isRfiOpen } from "@/lib/entityPredicates";
const RevisionDeepDiveModal = lazyWithRetry(() => import("@/components/drawings/RevisionImpactReportModal"));

// Lazy-load the existing pages as tab content — use lazyWithRetry so stale-
// chunk 404s after a deploy trigger a reload instead of a hard crash.
const SubmittalsPage = lazyWithRetry(() => import("@/pages/Submittals"));
// Heavy tab panels — each only renders on its own tab, so code-split them off
// the hub's route chunk. They already mount conditionally inside the <Suspense>
// boundary below, so deferring the import is behavior-preserving.
const SubmittalVisualBoard = lazyWithRetry(
  () => import("@/components/submittals/SubmittalVisualBoard"),
) as unknown as ComponentType<AnyProps>;
const DocControlPanel = lazyWithRetry(() =>
  import("@/components/drawings/register/DocControlPanel").then((m) => ({
    default: m.DocControlPanel,
  })),
) as unknown as ComponentType<AnyProps>;
// Overlay compare carries pdfjs — keep it off the hub's route chunk.
const RevisionCompareModalLazy = lazyWithRetry(
  () => import("@/components/drawings/RevisionCompareModal"),
) as unknown as ComponentType<AnyProps>;

// The design-system primitives + these shared screens are still .jsx; cast
// at the boundary (removable once the shared layer is typed).
type AnyProps = PropsWithChildren<Record<string, any>>;
const CommandBar = CommandBarRaw as unknown as ComponentType<AnyProps>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
const ErrorBoundary = ErrorBoundaryRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const ModelElementImportModal = ModelElementImportModalRaw as unknown as ComponentType<AnyProps>;

export default function DrawingSubmittalHub() {
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
  const qc = useQueryClient();
  const { can } = usePermissions();
  const projectId = activeProject?.id as string | undefined;
  const projectName = activeProject?.name || activeProject?.project_number || "";

  // The 3D model viewer is flag-gated until verified against real models in prod.
  const show3d = useFlag("viewer_3d");
  // Desktop shell skin — ModuleHeader replaces CommandBar when on.
  const desktopShell = useFlag("desktop_shell");
  const tabs = useMemo(
    () => (show3d ? [...TABS, { key: "model3d", label: "3D Model", icon: Box }] : TABS),
    [show3d],
  );

  // Tab state from URL (persistent across navigation)
  const tabParam = searchParams.get("hub_tab") || "overview";
  const activeTab = tabs.find((t) => t.key === tabParam) ? tabParam : "overview";
  const setActiveTab = (key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("hub_tab", key);
      return next;
    }, { replace: true });
  };

  // ── Data for KPI strip & matrix ────────────────────────────────────────
  const { drawings, isLoading: drawingsLoading } = useDrawings(projectId);
  const {
    submittals, kpis, roundsBySubmittal,
    isLoading: submittalsLoading,
  } = useSubmittals(projectId);

  // Drawing sets (for matrix)
  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing-sets", projectId],
    queryFn: () => entities.DrawingSet.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
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
  const { data: drawingRevisions = [] } = useQuery({
    queryKey: ["drawing-revisions", projectId],
    queryFn: () => entities.DrawingRevision.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  // Latest persisted Revision Summary per set → the "revised · N" badge + re-open.
  const { data: summariesBySet = new Map() } = useQuery({
    queryKey: ["revision-summaries", projectId],
    queryFn: () => getLatestSummariesByProject(projectId as string),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  // 3D model members (BIM integration Phase 0 — piece-mark mapping).
  const { data: modelElements = [], isLoading: modelElementsLoading } = useQuery({
    queryKey: ["model-elements", projectId],
    // Big models run 3k–12k+ elements. A single Supabase request is capped at
    // 1000 rows server-side (db-max-rows), so `.limit(50000)` silently returned
    // only the first 1000 — leaving most pieces with no color/click data and
    // fab colors that "didn't stick" (the assigned pieces weren't in the 1000).
    // fetchAllModelElements pages with .range() so the WHOLE roster loads.
    queryFn: () => fetchAllModelElements(projectId),
    enabled: !!projectId,
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
    if (!projectId) return;
    try {
      await qc.invalidateQueries({ queryKey: ["drawing-revisions", projectId] });
      const freshRevisions = await qc.fetchQuery({
        queryKey: ["drawing-revisions", projectId],
        queryFn: () => entities.DrawingRevision.filter({ project_id: projectId }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pkg = setPackages.find((p: any) => p.key === pkgKey);
      if (!pkg) return;
      const summary = buildRevisionSummary({
        set: pkg,
        revisions: freshRevisions as any[],
        rfis: rfis as any[],
        drawingSets: drawingSets as any[],
        workPackages: workPackages as any[],
        modelElements: modelElements as any[],
      });
      saveRevisionSummary({ projectId, drawingSetId: pkg.setId, summary, generatedBy: null })
        .then(() => qc.invalidateQueries({ queryKey: ["revision-summaries", projectId] }))
        .catch((err) => {
          // The card already shows (best-effort), but persistence failed — surface it
          // so a missing "revised · N" set badge isn't a silent mystery (e.g. an RLS
          // reject below the ≥field insert floor, or a transient DB error).
          console.warn("[revision-summary] persist failed:", err);
          toast.warning("Revision summary shown, but couldn't be saved — the set badge may not persist.");
        });
      setSummaryCard(summary);
    } catch {
      /* the summary is best-effort — never block the upload flow */
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openDeepDive = (summary: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkg = setPackages.find((p: any) => String(p.setId) === String(summary?.setId));
    setSummaryCard(null);
    if (pkg) setDeepDiveSet(pkg);
  };
  // Create an RFI pre-filled from the deterministic summary (no AI diff needed);
  // the user reviews/edits it in RFIFormModal before it is saved.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openRfiFromSummary = (summary: any) => {
    setSummaryCard(null);
    setRfiDraft({ prefill: buildRfiPrefillFromSummary(summary) });
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveRfiFromSummary = async (formData: any) => {
    setSavingRfi(true);
    try {
      const created = await createRfiAndLink({ projectId, formData, deltaId: undefined });
      setRfiDraft(null);
      toast.success(`Created ${created?.rfi_number || "RFI"} from revision summary`);
      qc.invalidateQueries({ queryKey: ["rfis", projectId] });
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
        project: activeProject,
        workPackage,
        openRfiIds,
      }));
    }
    return m;
  }, [setPackages, wpById, openRfiIds, activeProject]);

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

  // Sequence-aware readiness rollup (group packages by erection sequence).
  const sequenceReadiness = useMemo(() => {
    const entries = Array.from(readinessByKey.values()).map((r: any) => ({
      sequenceNumber: r.sequenceNumber,
      effectiveState: r.effectiveState,
      fabricationReady: r.fabricationReady,
      erectionReady: r.erectionReady,
      atRisk: r.scheduleRisk?.atRisk,
    }));
    return computeSequenceReadiness(entries);
  }, [readinessByKey]);

  // ── Drawing KPIs ───────────────────────────────────────────────────────
  const drawingKpis = useMemo(() => {
    const active = drawings.filter((d) => !d.is_superseded && !d.is_deleted);
    const released = setPackages.filter(isClosedPackage).length;
    // "In review" = active workflow stages (post-077): IFA / OFA / BFA / OFS / IFC.
    const inReview = setPackages.filter((pkg) =>
      pkg.sheets.some((d) => ["IFA", "OFA", "BFA", "OFS", "IFC"].includes(d.stage ?? ""))
    ).length;
    const overdueDrawings = setPackages.filter((pkg) =>
      pkg.sheets.some((d) => dueInfo(getDrawingDueDate(d), isClosedDrawing(d)).overdue)
    ).length;
    return {
      totalSets: setPackages.length,
      totalSheets: active.length,
      released,
      inReview,
      overdue: overdueDrawings,
    };
  }, [drawings, setPackages]);

  // ── Fab-Ready KPI ──────────────────────────────────────────────────────
  const fabReady = useMemo(
    () => computeFabReady(drawings, submittals),
    [drawings, submittals]
  );

  const isLoading = drawingsLoading || submittalsLoading;

  const triage = useMemo(() => {
    const activeSubmittals = submittals.filter((s) => !s.is_deleted) as any[];

    const setItems = setPackages.map((pkg) => {
      const sortedSubmittals = pkg.submittals
        .slice()
        .sort((a, b) => (b.round_number || 1) - (a.round_number || 1));
      const latestSubmittal = sortedSubmittals[0] || null;
      // Coalesced operational state (drafting → submittal → release). Kept
      // alongside `status` (additive) so the existing pipeline/row display is
      // unchanged; surfaced as its own chip + drives the drafting control.
      const detailingState = effectiveDetailingState(pkg.parent, pkg.submittals, pkg.sheets);
      // R&R loops back to the IFA stage for counts; surface it as its own flag so
      // the board doesn't read an R&R rejection as a fresh IFA (matches register).
      const isRR = isPackageRR(pkg.submittals);
      // CLOSED is satisfied by ANY terminal signal — not only a closed
      // submittal status. Previous logic prioritised `latestSubmittal` and
      // ignored the set-level lock + the coalesced detailing state, so a
      // package that was manually released (e.g. anchor bolts: set locked
      // and/or detailing_state=Released for Erection) whose submittal was
      // never rolled to "Released for Fabrication" lingered on the hit list.
      const closed = isClosedPackage(pkg);
      const dueDate = getSubmittalDueDate(latestSubmittal) || earliestDate(pkg.sheets.map(getDrawingDueDate));
      // Only surface "needs action" when the package is OPEN (closed items
      // never reach the hit list anyway, but guard against stale per-sheet
      // Rejected/Returned stages on packages that have since been released).
      const needsAction = !closed && (
        (latestSubmittal && ACTION_STATUSES.has(latestSubmittal.status ?? "")) ||
        pkg.sheets.some((drawing) => ["Rejected", "Revise and Resubmit", "Returned"].includes(drawing.stage ?? ""))
      );
      const status = latestSubmittal?.status || rollupDrawingStage(pkg.sheets);
      const canDraft = !hasGoverningSubmittal(pkg.submittals);
      const owner =
        latestSubmittal?.ball_in_court ||
        latestSubmittal?.assigned_to ||
        latestSubmittal?.reviewer ||
        pkg.sheets.find((drawing) => drawing.ball_in_court || drawing.assigned_to || drawing.reviewer)?.ball_in_court ||
        pkg.sheets.find((drawing) => drawing.assigned_to)?.assigned_to ||
        pkg.sheets.find((drawing) => drawing.reviewer)?.reviewer ||
        "Unassigned";
      const submittalLabel = latestSubmittal?.submittal_number ? `Submittal ${latestSubmittal.submittal_number}` : "No linked submittal";
      return {
        id: `set-${pkg.key}`,
        kind: "Drawing Set",
        title: pkg.name,
        group: `${pkg.sheets.length} sheet${pkg.sheets.length === 1 ? "" : "s"} - ${submittalLabel}`,
        status,
        owner,
        dueDate,
        due: dueInfo(dueDate, closed),
        closed,
        needsAction,
        routeTab: "drawings",
        detailingState,
        isRR,
        _canDraft: canDraft,
        _detailingStateRaw: pkg.parent?.detailing_state ?? null,
        _readiness: readinessByKey.get(pkg.key) || null,
        // Entity references for inline editing
        _submittalId: latestSubmittal?.id || null,
        _drawingSetId: pkg.setId || null,
        _firstSheetId: pkg.sheets[0]?.id || null,
        // All sheet ids in the package — the due-date mutation writes every one
        // of these so earliestDate() always reflects the board-level edit.
        _sheetIds: (pkg.sheets || []).map((s) => s.id).filter(Boolean) as string[],
      };
    });

    const linkedSubmittalIds = new Set(
      setPackages.flatMap((pkg) => pkg.submittals.map((submittal) => submittal.id).filter(Boolean))
    );
    const unlinkedSubmittalItems = activeSubmittals
      .filter((submittal) => !linkedSubmittalIds.has(submittal.id))
      .map((submittal) => {
      const closed = isClosedSubmittal(submittal);
      const dueDate = getSubmittalDueDate(submittal);
      const title = [submittal.submittal_number, submittal.title || submittal.description]
        .filter(Boolean)
        .join(" - ") || "Untitled submittal";
      const needsAction = ACTION_STATUSES.has(submittal.status);
      return {
        id: `submittal-${submittal.id}`,
        kind: "Unlinked Submittal",
        title,
        group: "No drawing set name linked",
        status: submittal.status || "Draft",
        owner: submittal.ball_in_court || submittal.assigned_to || submittal.reviewer || "Unassigned",
        dueDate,
        due: dueInfo(dueDate, closed),
        closed,
        needsAction,
        routeTab: "submittals",
        // Entity references for inline editing
        _submittalId: submittal.id,
        _drawingSetId: null as string | null,
        _firstSheetId: null as string | null,
        // Unlinked submittals always dispatch through the submittal branch, so [].
        _sheetIds: [] as string[],
      };
    });

    const openItems = [...setItems, ...unlinkedSubmittalItems].filter((item) => !item.closed);
    const overdue = openItems.filter((item) => item.due.overdue).sort(itemUrgency);
    const dueSoon = openItems
      .filter((item) => item.due.dueSoon)
      .sort(itemUrgency);
    const needsAction = openItems
      .filter((item) => item.needsAction)
      .sort(itemUrgency);
    const noDate = openItems
      .filter((item) => !item.dueDate)
      .sort(itemUrgency);

    const pipelineCounts = openItems.reduce((acc: Record<string, number>, item) => {
      const key = item.status || "No status";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      setItems,
      unlinkedSubmittalItems,
      openItems: openItems.sort(itemUrgency),
      overdue,
      dueSoon,
      needsAction,
      noDate,
      pipelineCounts,
      overdueDrawingSets: overdue.filter((item) => item.kind === "Drawing Set").length,
      overdueUnlinkedSubmittals: overdue.filter((item) => item.kind === "Unlinked Submittal").length,
      dueSoonDrawingSets: dueSoon.filter((item) => item.kind === "Drawing Set").length,
      noDateDrawingSets: noDate.filter((item) => item.kind === "Drawing Set").length,
      atRiskCount: setItems.filter((item) => item._readiness?.scheduleRisk?.atRisk).length,
    };
  }, [submittals, setPackages, readinessByKey]);

  const tabCounts = useMemo(() => ({
    overview: triage.openItems.length,
    process: setPackages.length + triage.unlinkedSubmittalItems.length,
    drawings: drawingKpis.totalSets,
    submittals: kpis.total,
    matrix: drawingSets.filter((set) => !set?.is_deleted).length,
  }), [triage.openItems.length, triage.unlinkedSubmittalItems.length, setPackages.length, drawingKpis.totalSets, kpis.total, drawingSets]);

  // ── Inline quick-action mutations (Next Decision card) ────────────────
  const invalidateHub = () => {
    // Sets read under both "drawing-sets" (hub) and "drawing_sets" (Drawings/
    // Submittals) keys — invalidate both spellings + the register view so a hub
    // edit reflects everywhere (and vice-versa).
    invalidateEntity(qc, "drawingSet", projectId);
    qc.invalidateQueries({ queryKey: ["drawings", projectId] });
    qc.invalidateQueries({ queryKey: ["submittals", projectId] });
  };

  const updateOwnerMut = useMutation({
    mutationFn: async ({ item, owner }: { item: any; owner: string }) => {
      if (item._submittalId) {
        await entities.Submittal.update(item._submittalId, { ball_in_court: owner });
      } else if (item._firstSheetId) {
        await entities.Drawing.update(item._firstSheetId, { assigned_to: owner } as any);
      } else {
        throw new Error("No entity available to assign owner");
      }
    },
    onSuccess: (_data, { owner }) => {
      invalidateHub();
      toast.success(`Owner assigned: ${owner}`);
    },
    onError: (err) => toast.error("Failed to assign owner: " + (err?.message || "Unknown")),
  });

  const updateDueDateMut = useMutation({
    mutationFn: async ({ item, date }: { item: any; date: string }) => {
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
        await Promise.all(ids.map((id: string) => entities.Drawing.update(id, { due_date: date })));
      }
    },
    onSuccess: () => {
      invalidateHub();
      toast.success("Due date set");
    },
    onError: (err) => toast.error("Failed to set due date: " + (err?.message || "Unknown")),
  });

  // Advance the manual detailing (drafting/release) state on a drawing set.
  // Only meaningful when no submittal governs the package (the submittal
  // machine owns the middle of the flow); the UI gates the control accordingly.
  const updateDetailingStateMut = useMutation({
    mutationFn: async ({ item, next }: { item: any; next: string }) => {
      if (!item?._drawingSetId) throw new Error("No drawing set to update");
      await entities.DrawingSet.update(item._drawingSetId, { detailing_state: next } as any);
    },
    onSuccess: (_data, { next }) => {
      invalidateHub();
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
    onSuccess: (_data, { field, value }) => {
      invalidateHub();
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

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      className="drawing-submittal-hub"
      style={{
        minHeight: "100vh",
        background: "var(--bg-page)",
        color: textPrimary,
        padding: "24px 28px",
      }}
    >
      {/* ── Command Bar ──────────────────────────────────────────────── */}
      <CommandBar
        eyebrow={projectName ? `Detailing control - ${projectName}` : "Detailing control"}
        title="Drawing & Submittal Control"
        count={drawingKpis.totalSets}
        unit={` sets | ${drawingKpis.totalSheets} sheets`}
        subtitle="Set-level drawing packages, submittal status, due dates, ownership, and fabrication-release readiness."
      >
        <HeaderSignal
          icon={AlertTriangle}
          label="Overdue"
          value={triage.overdue.length}
          tone={triage.overdue.length ? error : success}
        />
        <HeaderSignal
          icon={CalendarClock}
          label="At Risk"
          value={triage.atRiskCount}
          tone={triage.atRiskCount ? warning : success}
        />
        <HeaderSignal
          icon={Gauge}
          label="In Review"
          value={drawingKpis.inReview}
          tone={drawingKpis.inReview > 0 ? info : textMuted}
        />
        <HeaderSignal
          icon={Link2}
          label="Unlinked"
          value={triage.unlinkedSubmittalItems.length}
          tone={triage.unlinkedSubmittalItems.length ? warning : textMuted}
        />
        <button
          type="button"
          className="sbd-btn-ghost"
          onClick={() => setLeadModalOpen(true)}
          title="Edit the project's detailing lead times (drives the backward schedule)"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36 }}
        >
          <CalendarClock size={14} />
          Lead Times
        </button>
      </CommandBar>

      {/* ── KPI Strip ────────────────────────────────────────────────── */}
      <div className="sbp-hub-kpi-strip" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: 10,
        marginBottom: 14,
      }}>
        <KpiTile compact label="Drawing Sets" value={drawingKpis.totalSets} sub={`${drawingKpis.totalSheets} active sheets`} color={accent} loading={isLoading} />
        <KpiTile compact label="Sets Released" value={drawingKpis.released} color={success} loading={isLoading} />
        <KpiTile compact label="Sets In Review" value={drawingKpis.inReview} color={info} loading={isLoading} />
        <KpiTile compact label="Submittals" value={kpis.total} sub={`${kpis.pending} pending`} color={accent} loading={isLoading} />
        <KpiTile compact label="Needs Action" value={kpis.rejected} color={review} loading={isLoading} />
        <KpiTile
          compact
          label="Overdue"
          value={triage.overdue.length}
          sub={
            triage.overdueDrawingSets > 0 && triage.overdueUnlinkedSubmittals > 0
              ? `${triage.overdueDrawingSets} set${triage.overdueDrawingSets === 1 ? "" : "s"} · ${triage.overdueUnlinkedSubmittals} unlinked sub${triage.overdueUnlinkedSubmittals === 1 ? "" : "s"}`
              : triage.overdueUnlinkedSubmittals > 0
              ? `${triage.overdueUnlinkedSubmittals} unlinked sub${triage.overdueUnlinkedSubmittals === 1 ? "" : "s"}`
              : triage.overdueDrawingSets > 0
              ? `${triage.overdueDrawingSets} drawing set${triage.overdueDrawingSets === 1 ? "" : "s"}`
              : "packages + unlinked subs"
          }
          color={error}
          loading={isLoading}
        />
        <KpiTile compact label="Fab Ready" value={`${fabReady.numerator}/${fabReady.denominator}`} sub={`${fabReady.percent}% released`} color={success} loading={isLoading} />
      </div>

      {/* ── Zero-state legibility note ───────────────────────────────── */}
      {/* Only shown when there are NO drawing sets yet but submittals exist —
          the situation where drawing-set tiles read 0 while Overdue is non-zero.
          Hidden for normal projects where setPackages is populated. */}
      {setPackages.length === 0 && submittals.filter((s) => !s.is_deleted).length > 0 && (
        <div
          role="note"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            padding: "7px 12px",
            borderRadius: 8,
            border: `1px solid color-mix(in srgb, ${warning} 28%, ${border})`,
            background: `color-mix(in srgb, ${warning} 6%, var(--bg-surface-low))`,
            fontFamily: mono,
            fontSize: 11,
            color: textMuted,
            lineHeight: 1.4,
          }}
        >
          <AlertTriangle size={12} color={warning} style={{ flexShrink: 0 }} />
          <span>
            No drawing sets linked yet — set-level tiles above show 0.{" "}
            Overdue items below are unlinked submittals.{" "}
            Link submittals to a drawing set (or upload drawings) to populate set-level metrics.
          </span>
        </div>
      )}

      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div className="sbp-hub-tabbar" style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap",
        alignItems: "center",
        padding: 6,
        marginBottom: 16,
        background: "color-mix(in srgb, var(--bg-surface) 82%, transparent)",
        border: `1px solid ${border}`,
        borderRadius: 14,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const Icon = tab.icon;
          return (
            <button
              className={`sbp-hub-tab${isActive ? " is-active" : ""}`}
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                minHeight: 40,
                padding: "8px 12px",
                borderRadius: 10,
                border: `1px solid ${isActive ? accent : "transparent"}`,
                background: isActive
                  ? "color-mix(in srgb, var(--accent) 14%, var(--bg-surface-high) 86%)"
                  : "transparent",
                color: isActive ? textPrimary : textMuted,
                fontFamily: mono,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              <span
                className="sbd-num"
                data-hub-tab-count="true"
                style={{
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: isActive ? "color-mix(in srgb, var(--accent) 18%, transparent)" : surface2,
                  border: `1px solid ${isActive ? "color-mix(in srgb, var(--accent) 32%, transparent)" : border}`,
                  color: isActive ? accent : textMuted,
                  fontSize: 10,
                  lineHeight: 1.2,
                }}
              >
                {tabCounts[tab.key as keyof typeof tabCounts] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      <div style={{ minHeight: 0, position: "relative" }}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingSkeleton />}>
            {activeTab === "overview" && (
              <>
              <FleetHealthStrip fleet={fleetHealth} onOpenRegister={() => setActiveTab("drawings")} />
              <TriageBoard
                triage={triage}
                kpis={kpis}
                drawingKpis={drawingKpis}
                isLoading={isLoading}
                onOpenTab={setActiveTab}
                onUpdateOwner={(item, owner) => updateOwnerMut.mutate({ item, owner })}
                onUpdateDueDate={(item, date) => updateDueDateMut.mutate({ item, date })}
                onAdvanceDetailing={(item, next) => updateDetailingStateMut.mutate({ item, next })}
                onToggleReadiness={(item, field, value) => updateReadinessFlagMut.mutate({ item, field, value })}
                sequenceReadiness={sequenceReadiness}
                revisionImpact={revisionImpact}
                isSaving={updateOwnerMut.isPending || updateDueDateMut.isPending || updateDetailingStateMut.isPending || updateReadinessFlagMut.isPending}
                onEscalate={canEscalate ? (item: any, kind: EscalationKind) => { setEscalateItem(item); setEscalateKind(kind); } : undefined}
                onCompareRevision={(drawingId: string) => setCompareDrawingId(drawingId)}
                modelMapping={modelMappingSummary}
                modelElementRows={modelElements as any[]}
                onImportModelElements={() => setImportModelOpen(true)}
              />
              </>
            )}
            {activeTab === "process" && (
              <SubmittalVisualBoard
                setPackages={setPackages}
                submittals={submittals}
                isLoading={isLoading}
                onOpenTab={setActiveTab}
              />
            )}
            {activeTab === "drawings" && (
              <DrawingRegisterTable
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
            {activeTab === "submittals" && <SubmittalsPage />}
            {activeTab === "matrix" && (
              <ApprovalMatrix
                drawingSets={drawingSets}
                submittals={submittals as unknown as HubSubmittal[]}
                roundsBySubmittal={roundsBySubmittal}
                isLoading={isLoading}
              />
            )}
            {activeTab === "revimpact" && (
              <RevisionImpactBoard
                rows={revisionImpactRows}
                onCompareRevision={(drawingId: string) => setCompareDrawingId(drawingId)}
                isLoading={isLoading}
              />
            )}
            {activeTab === "doccontrol" && <DocControlPanel projectId={projectId} />}
            {activeTab === "model3d" && (
              <Model3DTab modelMapping={modelMappingSummary} modelElementRows={modelElements as any[]} projectId={projectId} rosterLoading={modelElementsLoading} />
            )}
          </Suspense>
        </ErrorBoundary>
      </div>

      {leadModalOpen && (
        <LeadTimesModal
          leadDays={resolveLeadDays(activeProject, null)}
          defaults={DEFAULT_LEAD_DAYS}
          saving={saveLeadsMut.isPending}
          onSave={(leads) => saveLeadsMut.mutate(leads)}
          onClose={() => setLeadModalOpen(false)}
        />
      )}

      {/* Contextual escalation: queue item → draft RFI / potential CO. */}
      {escalateItem && (
        <EscalateModal
          item={escalateItem}
          initialKind={escalateKind}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setEscalateItem(null)}
        />
      )}

      {/* Revision overlay compare (old=red / new=blue). */}
      {compareDrawing && (
        <Suspense fallback={null}>
          <RevisionCompareModalLazy
            open
            onClose={() => setCompareDrawingId(null)}
            drawing={compareDrawing}
          />
        </Suspense>
      )}

      {/* Tekla/SDS2 member CSV import (BIM integration Phase 0). */}
      {importModelOpen && (
        <ModelElementImportModal
          open
          projectId={projectId}
          projectName={projectName}
          drawings={drawings}
          existingElements={modelElements}
          onClose={() => setImportModelOpen(false)}
        />
      )}

      {/* Revision Summary digest (slice 3) — instant on upload, re-openable from the badge. */}
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
    </div>
  );
}
