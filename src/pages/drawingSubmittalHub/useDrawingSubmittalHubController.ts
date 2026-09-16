import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { toast } from "sonner";
import { useDrawings } from "@/hooks/useDrawings";
import { useSubmittals } from "@/hooks/useSubmittals";
import { activeHoldCount, useDrawingHolds } from "@/hooks/useDrawingHolds";
import { useTransmittals } from "@/hooks/useTransmittals";
import { invalidateEntity } from "@/services/cacheRegistry";
import { computeFabReady } from "@/lib/submittalAnalytics";
import { computeDetailingReadiness } from "@/lib/detailingReadiness";
import { summarizeElementStatuses } from "@/services/modelElementStatus";
import { countModelElements, fetchAllModelElements } from "@/lib/ifc/fetchAllModelElements";
import { computeRevisionImpact } from "@/lib/detailingRevisionImpact";
import { buildRevisionImpactRows } from "@/lib/revisionImpactBoard";
import { buildRevisionSummary, saveRevisionSummary, getLatestSummariesByProject } from "@/lib/revisionSummaryRepo";
import { buildRfiPrefillFromSummary, createRfiAndLink } from "@/lib/rfiFromDelta";
import { isRfiOpen } from "@/lib/entityPredicates";
import { normNum } from "@/lib/fabReleaseGate";
import {
  TABS,
  buildCurrentRevisionIdMap,
  buildCurrentRevisionMap,
  buildDrawingKpis,
  buildSequenceReadiness,
  buildSetPackages,
  buildTriage,
  dueDateWriteTargets,
  validateDetailingStateWrite,
  validateDueDateWrite,
} from "./format";
import { calculateDrawingHealthScore, summarizeFleetHealth } from "@/services/drawingHealthScore";
import { withProjectId } from "@/lib/mutations/standardMutation";

export function useDrawingSubmittalHubController(projectId: string | undefined) {
  const qc = useQueryClient();

  // State
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const [escalateItem, setEscalateItem] = useState<any | null>(null);
  const [escalateKind, setEscalateKind] = useState<string>("rfi");
  const [compareDrawingId, setCompareDrawingId] = useState<string | null>(null);
  const [importModelOpen, setImportModelOpen] = useState(false);
  const [summaryCard, setSummaryCard] = useState<any | null>(null);
  const [deepDiveSet, setDeepDiveSet] = useState<any | null>(null);
  const [rfiDraft, setRfiDraft] = useState<any | null>(null);
  const [savingRfi, setSavingRfi] = useState(false);
  const summaryInFlight = useRef(new Set<string>());

  // Queries
  const { drawings, isLoading: drawingsLoading } = useDrawings(projectId);
  const { submittals, kpis, roundsBySubmittal, isLoading: submittalsLoading } = useSubmittals(projectId);

  const { data: drawingSets = [], isPending: drawingSetsLoading } = useQuery({
    queryKey: ["drawing-sets", projectId],
    queryFn: () => entities.DrawingSet.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const holdsQuery = useDrawingHolds(projectId ?? null);
  const holds = holdsQuery.data ?? [];
  const holdsStatus = holdsQuery.data !== undefined ? "ready" : holdsQuery.isError ? "error" : "loading";
  const activeHolds = holdsStatus === "ready" ? activeHoldCount(holds) : null;

  const transmittalsQuery = useTransmittals(projectId ?? null, { enabled: false }); // enabled by view in shell
  const { data: transmittals, isPending: transmittalsPending } = transmittalsQuery;

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
  const { data: summariesBySet = new Map() } = useQuery({
    queryKey: ["revision-summaries", projectId],
    queryFn: () => getLatestSummariesByProject(projectId as string),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const { data: modelElementCount = null, isPending: modelElementCountLoading } = useQuery({
    queryKey: ["model-elements-count", projectId],
    queryFn: () => countModelElements(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const [mappingRosterRequested, setMappingRosterRequested] = useState(false);
  const { data: modelElements = [], isFetching: modelElementsLoading, error: modelElementsError } = useQuery({
    queryKey: ["model-elements", projectId],
    queryFn: () => fetchAllModelElements(projectId),
    enabled: !!projectId && (mappingRosterRequested), // 3D tab handled in shell
    staleTime: 60_000,
  });

  // Derived
  const setPackages = useMemo(
    () => buildSetPackages(drawings as any[], drawingSets as any[], submittals as any[]),
    [drawings, drawingSets, submittals]
  );

  const currentRevByDrawingId = useMemo(
    () => buildCurrentRevisionMap(drawingRevisions as any[]),
    [drawingRevisions]
  );

  const currentRevisionIdByDrawingId = useMemo(
    () => buildCurrentRevisionIdMap(drawingRevisions as any[] | undefined),
    [drawingRevisions]
  );

  const healthByKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const pkg of setPackages) {
      m.set(pkg.key, calculateDrawingHealthScore(pkg, { rfis: rfis as any[], revisions: drawingRevisions as any[] }));
    }
    return m;
  }, [setPackages, rfis, drawingRevisions]);

  const fleetHealth = useMemo(() => summarizeFleetHealth([...healthByKey.values()]), [healthByKey]);

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

  const openRfiNumbers = useMemo(() => {
    const s = new Set<string>();
    for (const r of (rfis as any[]) || []) {
      if (!r || r.is_deleted || !isRfiOpen(r)) continue;
      const key = normNum(r.rfi_number);
      if (key) s.add(key);
    }
    return s;
  }, [rfis]);

  const readinessByKey = useMemo(() => {
    const m = new Map<string, any>();
    for (const pkg of setPackages) {
      const wpIds: string[] = Array.isArray((pkg.parent as any)?.linked_work_package_ids)
        ? (pkg.parent as any).linked_work_package_ids
        : [];
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
        project: { id: projectId },
        workPackage,
        openRfiIds,
        openRfiNumbers,
      }));
    }
    return m;
  }, [setPackages, wpById, openRfiIds, openRfiNumbers, projectId]);

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

  const revisionImpact = useMemo(() => {
    const drawingsById = new Map<string, any>();
    for (const d of (drawings as any[]) || []) {
      if (d && d.id) drawingsById.set(String(d.id), d);
    }
    return computeRevisionImpact({ revisions: drawingRevisions as any[], drawingsById });
  }, [drawings, drawingRevisions]);

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

  const sequenceReadiness = useMemo(() => buildSequenceReadiness(readinessByKey), [readinessByKey]);
  const drawingKpis = useMemo(() => buildDrawingKpis(drawings, setPackages), [drawings, setPackages]);
  const fabReady = useMemo(() => computeFabReady(drawings, submittals), [drawings, submittals]);
  const triage = useMemo(() => buildTriage(submittals, setPackages, readinessByKey, false), [submittals, setPackages, readinessByKey]);

  const tabCounts = useMemo(() => ({
    overview: triage.openItems.length,
    process: setPackages.length + triage.unlinkedSubmittalItems.length,
    drawings: drawingKpis.totalSheets,
    submittals: kpis.total,
    matrix: drawingSets.filter((set) => !set?.is_deleted).length,
    holds: activeHolds ?? 0,
  }), [triage, setPackages, drawingKpis, kpis, drawingSets, activeHolds]);

  const invalidateHub = async () => {
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
        await entities.Drawing.update(item._firstSheetId, { reviewer: owner });
      } else {
        throw new Error("No package-level owner field exists; assign the first sheet instead.");
      }
    },
    onSuccess: async () => {
      await invalidateHub();
      toast.success("Owner assigned");
    },
    onError: (err) => toast.error("Failed to assign owner: " + (err?.message || "Unknown")),
  });

  const updateDueDateMut = useMutation({
    mutationFn: async ({ item, date }: { item: any; date: string }) => {
      const dueDateError = validateDueDateWrite(item, date);
      if (dueDateError) throw new Error(dueDateError);
      const targets = dueDateWriteTargets(item);
      if ("submittalId" in targets) {
        await entities.Submittal.update(targets.submittalId, { required_date: date });
      } else {
        const ids = targets.sheetIds.length ? targets.sheetIds : item._firstSheetId ? [item._firstSheetId] : [];
        if (!ids.length) throw new Error("No entity available to set due date");
        await entities.Drawing.bulkUpdate(ids, { due_date: date });
      }
    },
    onSuccess: async () => {
      await invalidateHub();
      toast.success("Due date set");
    },
    onError: (err) => toast.error("Failed to set due date: " + (err?.message || "Unknown")),
  });

  const updateDetailingStateMut = useMutation({
    mutationFn: async ({ item, next }: { item: any; next: string }) => {
      const stateError = validateDetailingStateWrite(item, next);
      if (stateError) throw new Error(stateError);
      if (!item._drawingSetId) throw new Error("No drawing set to update");
      await entities.DrawingSet.update(item._drawingSetId, { detailing_state: next } as any);
    },
    onSuccess: async () => {
      await invalidateHub();
      toast.success("Detailing state updated");
    },
    onError: (err) => toast.error("Failed to set detailing state: " + (err?.message || "Unknown")),
  });

  const updateReadinessFlagMut = useMutation({
    mutationFn: async ({ item, field, value }: { item: any; field: string; value: boolean }) => {
      if (!item?._drawingSetId) throw new Error("No drawing set to update");
      await entities.DrawingSet.update(item._drawingSetId, { [field]: value } as any);
    },
    onSuccess: async () => {
      await invalidateHub();
      toast.success("Readiness flag updated");
    },
    onError: (err) => toast.error("Failed to update readiness flag: " + (err?.message || "Unknown")),
  });

  const saveLeadsMut = useMutation({
    mutationFn: async (leads: Record<string, number>) => {
      if (!projectId) throw new Error("No active project");
      const nextMetadata = { ... (entities.Project.get(projectId)?.metadata || {}), detailing_lead_days: leads };
      await entities.Project.update(projectId, { metadata: nextMetadata } as any);
      return nextMetadata;
    },
    onSuccess: (nextMetadata) => {
      setLeadModalOpen(false);
      toast.success("Lead times updated");
    },
    onError: (err) => toast.error("Failed to save lead times: " + (err?.message || "Unknown")),
  });

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
      if (!pkg) return;
      const summary = buildRevisionSummary({
        set: pkg,
        revisions: freshRevisions as any[],
        rfis: rfis as any[],
        drawingSets: drawingSets as any[],
        workPackages: workPackages as any[],
        modelElements: modelElements as any[],
      });
      setSummaryCard(summary);
      await saveRevisionSummary({ projectId, drawingSetId: pkg.setId, summary, generatedBy: null });
      await invalidateEntity(qc, "drawing_revision", projectId);
      await invalidateEntity(qc, "drawingSet", projectId);
      await qc.invalidateQueries({ queryKey: ["revision-summaries", projectId] });
    } catch (err) {
      toast.warning("Revision summary generation failed");
    } finally {
      summaryInFlight.current.delete(pkgKey);
    }
  };

  const openDeepDive = (summary: any) => {
    const pkg = setPackages.find((p: any) => String(p.setId) === String(summary?.setId));
    setSummaryCard(null);
    if (pkg) setDeepDiveSet(pkg);
  };

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

  return {
    // State
    leadModalOpen, setLeadModalOpen,
    escalateItem, setEscalateItem,
    escalateKind, setEscalateKind,
    compareDrawingId, setCompareDrawingId,
    importModelOpen, setImportModelOpen,
    summaryCard, setSummaryCard,
    deepDiveSet, setDeepDiveSet,
    rfiDraft, setRfiDraft,
    savingRfi, setSavingRfi,

    // Queries
    drawings, drawingsLoading,
    submittals, submittalsLoading,
    drawingSets, drawingSetsLoading,
    holds, holdsStatus,
    activeHolds,
    transmittals, transmittalsPending,
    workPackages,
    rfis,
    drawingRevisions, revisionsLoading,
    summariesBySet,
    modelElementCount, modelElementCountLoading,
    modelElements, modelElementsLoading, modelElementsError,

    // Derived
    setPackages,
    currentRevByDrawingId,
    currentRevisionIdByDrawingId,
    healthByKey,
    fleetHealth,
    revisionImpact,
    revisionImpactRows,
    sequenceReadiness,
    drawingKpis,
    fabReady,
    triage,
    tabCounts,
    modelMappingSummary,

    // Mutations
    updateOwnerMut,
    updateDueDateMut,
    updateDetailingStateMut,
    updateReadinessFlagMut,
    saveLeadsMut,

    // Handlers
    handleRevisionUploaded,
    openDeepDive,
    openRfiFromSummary,
    saveRfiFromSummary,
    setMappingRosterRequested,
    invalidateHub,
  };
}
