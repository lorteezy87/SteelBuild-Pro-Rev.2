/**
 * FabRelease - shop release control surface for structural steel packages.
 *
 * The page answers the execution questions that matter before and during
 * fabrication: what is ready to release, what is blocked, what is in the shop,
 * and what is ready for logistics.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { logActivity } from "@/services/auditLogger";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { invalidateEntity, getQueryKey } from "@/services/cacheRegistry";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { withProjectId } from "@/lib/mutations/standardMutation";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { useResetOnProjectChange } from "@/hooks/useResetOnProjectChange";
import WPFormModalRaw from "@/components/workpackages/WPFormModal";
import { Button as ButtonRaw, EmptyState as EmptyStateRaw } from "@/components/design-system";
import SequenceFilterRaw from "@/components/shared/SequenceFilter";
import {
  BOARD_LANES,
  STATUS_ORDER,
  buildFabReleaseMetrics,
  fabReleaseLane,
  getWorkPackageDisplayName,
} from "./fabRelease/analytics";
import { STAGE_FILTERS, VIEW_OPTIONS } from "./fabRelease/format";
import { exportFabReleaseCSV } from "./fabRelease/exportCsv";
import { FAB_RELEASE_STYLES } from "./fabRelease/styles";
import { filterFabReleasePackages } from "./fabRelease/filter";
import { canStartFabPackageCreation, reserveFabReleaseNumber } from "./fabRelease/creation";
import { normalizeFabReleaseStage, normalizeFabReleaseView } from "./fabRelease/view";
import {
  BoardView,
  DetailPanel,
  ExceptionRail,
  FlowView,
  HoursView,
  RegisterView,
  StageFlowStrip,
  Toolbar,
  ViewHeader,
} from "./fabRelease/components";
import type { EnrichedWorkPackage } from "./fabRelease/types";
import FabReleaseControlCenter from "./fabRelease/FabReleaseControlCenter";

// The design-system primitives and LoadingSkeleton are still .jsx, so TS infers
// all of their destructured props as required when consumed from .tsx. Until
// those are typed, treat them as permissive components.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;
const EmptyState = EmptyStateRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
// WPFormModal and SequenceFilter are still .jsx; their untyped default-valued
// array props (`projects`, `allDrawings`, `items`) infer as `never[]` when
// consumed from .tsx. Treat them as permissive components until they are typed.
const WPFormModal = WPFormModalRaw as unknown as ComponentType<AnyProps>;
const SequenceFilter = SequenceFilterRaw as unknown as ComponentType<AnyProps>;

export default function FabRelease() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [view, setView] = useState("flow");
  const [stageFilter, setStageFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState<unknown>(null);
  const [detailWP, setDetailWP] = useState<EnrichedWorkPackage | null>(null);
  const [editingWP, setEditingWP] = useState<Record<string, unknown> | null>(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EnrichedWorkPackage | null>(null);
  const allocationInFlightRef = useRef(false);
  const [isAllocatingNumber, setIsAllocatingNumber] = useState(false);

  useResetOnProjectChange(projectId, () => {
    setDetailWP(null);
    setEditingWP(null);
    setWPModalOpen(false);
    setDeleteTarget(null);
  });

  useEffect(() => {
    const savedView = localStorage.getItem("fabReleaseView");
    const savedStage = localStorage.getItem("fabReleaseStage");
    if (savedView && VIEW_OPTIONS.some((option) => option.id === savedView)) setView(savedView);
    if (savedStage && STAGE_FILTERS.some((option) => option.id === savedStage)) setStageFilter(savedStage);

    const urlView = searchParams.get("view");
    const urlStage = searchParams.get("stage");
    const normalizedView = normalizeFabReleaseView(urlView);
    if (normalizedView) {
      setView(normalizedView);
    }
    const normalizedStage = normalizeFabReleaseStage(urlStage);
    if (normalizedStage) setStageFilter(normalizedStage);
  }, [searchParams]);

  const { data: workPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["wps-fab", projectId],
    queryFn: () => (projectId ? entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: drawings = [], isLoading: drawingLoading } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => (projectId ? entities.Drawing.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing-sets", projectId],
    queryFn: () => (projectId ? entities.DrawingSet.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => (projectId ? entities.RFI.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () => (projectId ? entities.Delivery.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: submittals = [] } = useQuery({
    queryKey: ["submittals", projectId],
    queryFn: () => (projectId ? entities.Submittal.filter({ project_id: projectId }) : Promise.resolve([])),
    enabled: Boolean(projectId),
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const project = projects.find((item) => item.id === projectId) || activeProject || null;
  // `projects` rows expose `name`; some legacy callers still carry a `project_name`
  // alias. Read the legacy key through a loose view so the original `||` fallback
  // order (legacy alias → canonical name → "Project") is preserved unchanged.
  const projectLegacyName = (project as Record<string, unknown> | null)?.project_name as string | undefined;
  const projectName = projectLegacyName || project?.name || "Project";

  const wpQueryKeys = [["work-packages", projectId], ["work_packages", projectId], getQueryKey("work_package", projectId)];
  useRealtimeInvalidation("work_packages", projectId, wpQueryKeys);

  const invalidateWorkPackages = () => invalidateEntity(qc, "work_package", projectId);

  const createWPMut = useMutation({
    mutationFn: (data: any) => entities.WorkPackage.create(
      withProjectId(data as Record<string, unknown>, projectId),
    ),
    onSuccess: async (created) => {
      logActivity("work_package", "created", created, { projectId });
      appendRecordToCaches(qc, wpQueryKeys, created, ((record: any, key: any) => !key[1] || record.project_id === key[1]) as unknown as () => boolean);
      await invalidateWorkPackages();
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Fab package created");
    },
    onError: (e) => toastCrudError(e, "Failed to create fab package"),
  });

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.WorkPackage.update(id, data),
    onSuccess: async (updated, variables) => {
      if (variables.data?.status) logActivity("work_package", "status_changed", updated, { projectId });
      else logActivity("work_package", "updated", updated, { projectId });
      replaceRecordInCaches(qc, wpQueryKeys, updated);
      await invalidateWorkPackages();
      setWPModalOpen(false);
      setEditingWP(null);
      setDetailWP((prev) => (prev?.id === variables.id ? null : prev));
      toast.success("Fab package updated");
    },
    onError: (e) => toastCrudError(e, "Failed to update fab package"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.WorkPackage.delete(id),
    onSuccess: async (_, deletedId) => {
      logActivity("work_package", "deleted", deleteTarget || { id: deletedId, project_id: projectId }, { projectId });
      removeRecordFromCaches(qc, wpQueryKeys, deletedId);
      await invalidateWorkPackages();
      setDetailWP((prev) => (prev?.id === deletedId ? null : prev));
      setDeleteTarget(null);
      toast.success("Fab package deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete fab package"),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) =>
      entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: async (updated, id) => {
      logActivity("work_package", "status_changed", updated, { projectId });
      replaceRecordInCaches(qc, wpQueryKeys, updated);
      await invalidateWorkPackages();
      setDetailWP((prev) => (prev?.id === id ? null : prev));
      toast.success("Package marked ready to ship");
    },
    onError: (e) => toastCrudError(e, "Failed to update package"),
  });

  const rfisByWpId = useMemo(() => {
    const map = new Map();
    for (const rfi of rfis) {
      const wpId = String(rfi.work_package_id || "");
      if (!wpId) continue;
      if (!map.has(wpId)) map.set(wpId, []);
      map.get(wpId).push(rfi);
    }
    return map;
  }, [rfis]);

  const deliveriesByWpId = useMemo(() => {
    const map = new Map();
    for (const d of deliveries) {
      const wpId = String(d.work_package_id || "");
      if (!wpId) continue;
      if (!map.has(wpId)) map.set(wpId, []);
      map.get(wpId).push(d);
    }
    return map;
  }, [deliveries]);

  const submittalsByDrawingSetId = useMemo(() => {
    const map = new Map();
    for (const sub of submittals) {
      const dsIds = Array.isArray(sub.drawing_set_ids) ? sub.drawing_set_ids : [];
      for (const dsId of dsIds) {
        const key = String(dsId);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(sub);
      }
    }
    return map;
  }, [submittals]);

  const metrics = useMemo(
    () => buildFabReleaseMetrics(workPackages, drawings, drawingSets, { rfisByWpId, deliveriesByWpId, submittalsByDrawingSetId }),
    [drawingSets, drawings, workPackages, rfisByWpId, deliveriesByWpId, submittalsByDrawingSetId]
  );

  const filtered = useMemo(() => {
    return filterFabReleasePackages(metrics.enriched, { stageFilter, riskFilter, seqFilter, search });
  }, [metrics.enriched, riskFilter, search, seqFilter, stageFilter]);

  const laneGroups = useMemo(() => {
    const groups: Record<string, EnrichedWorkPackage[]> = Object.fromEntries(BOARD_LANES.map((lane) => [lane, []]));
    for (const wp of filtered) {
      const lane = fabReleaseLane(wp);
      if (groups[lane]) groups[lane].push(wp);
      else groups.Blocked.push(wp);
    }
    return groups;
  }, [filtered]);

  const statusGroups = useMemo(() => {
    const groups: Record<string, EnrichedWorkPackage[]> = Object.fromEntries(STATUS_ORDER.map((status) => [status, []]));
    for (const wp of filtered) {
      const status = STATUS_ORDER.includes(wp._signals.status) ? wp._signals.status : "Not Started";
      groups[status].push(wp);
    }
    return groups;
  }, [filtered]);

  const handleViewChange = (nextView: string) => {
    setView(nextView);
    localStorage.setItem("fabReleaseView", nextView);
  };

  const handleStageFilter = (nextStage: string) => {
    setStageFilter(nextStage);
    localStorage.setItem("fabReleaseStage", nextStage);
  };

  const canCreate = can("create", "work_package");
  const canEdit = can("edit", "work_package");
  const canDelete = can("delete", "work_package");

  const handleOpenCreate = async () => {
    if (!projectId || !canStartFabPackageCreation({
      projectId,
      allocationInFlight: allocationInFlightRef.current,
      modalOpen: wpModalOpen,
      editing: editingWP,
    })) return;

    allocationInFlightRef.current = true;
    setIsAllocatingNumber(true);
    try {
      const wpNumber = await reserveFabReleaseNumber(projectId, getNextNumber);
      setDetailWP(null);
      setEditingWP({
        wp_number: wpNumber,
        project_id: projectId,
        project_name: projectName,
        phase: "Fabrication",
        status: "Not Started",
      });
      setWPModalOpen(true);
    } catch (err) {
      console.warn("[FabRelease] getNextNumber failed:", err?.message);
      toast.error("Unable to reserve a work package number. Please retry.");
    } finally {
      allocationInFlightRef.current = false;
      setIsAllocatingNumber(false);
    }
  };

  const handleEdit = (wp) => {
    setDetailWP(null);
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleSave = (data) => {
    const payload = {
      ...data,
      project_id: data.project_id || projectId,
      project_name: data.project_name || projectName,
    };
    if (editingWP?.id) updateWPMut.mutate({ id: editingWP.id as string, data: payload });
    else createWPMut.mutate(payload);
  };

  const clearFilters = () => {
    setSearch("");
    setStageFilter("all");
    setRiskFilter("all");
    setSeqFilter(null);
    localStorage.setItem("fabReleaseStage", "all");
  };

  if (!projectId) {
    return (
      <div className="sb-dashboard-reference-page fab-release-page">
        <style>{FAB_RELEASE_STYLES}</style>
        <EmptyState
          icon="wp"
          title="Select a project to view Fab Release"
          body="Fab release is project-scoped so drawing readiness, shop release dates, and package status stay tied to the active job."
        />
      </div>
    );
  }

  if (wpLoading || drawingLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  // Shared modals remain owned by this page so canonical presentation cannot
  // diverge from the existing mutation, permission, and audit behavior.
  const modals = (
    <>
      {detailWP && (
        <DetailPanel
          wp={detailWP}
          onClose={() => setDetailWP(null)}
          onEdit={can("edit", "work_package") ? () => handleEdit(detailWP) : null}
          onDelete={can("delete", "work_package") ? () => { setDeleteTarget(detailWP); setDetailWP(null); } : null}
          onComplete={() => completeMut.mutate(detailWP.id)}
          isCompleting={completeMut.isPending}
        />
      )}

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          open={wpModalOpen || !!editingWP}
          onClose={() => {
            setWPModalOpen(false);
            setEditingWP(null);
          }}
          onSave={handleSave}
          wp={editingWP}
          projects={projects}
          nextNumber={editingWP?.wp_number || ""}
          allDrawings={drawings}
          defaultProjectId={projectId || ""}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Fab Package"
        description={`Delete "${getWorkPackageDisplayName(deleteTarget || {})}"? This action cannot be undone.`}
      />
    </>
  );

  const workflowBody = view === "flow" ? (
    <FlowView
      rows={filtered}
      stageRollup={metrics.stageRollup}
      onOpen={setDetailWP}
      onEdit={canEdit ? handleEdit : null}
      onComplete={(wp) => completeMut.mutate(wp.id)}
      isCompleting={completeMut.isPending}
    />
  ) : view === "board" ? (
    <BoardView
      laneGroups={laneGroups}
      onOpen={setDetailWP}
      onEdit={canEdit ? handleEdit : null}
      onComplete={(wp) => completeMut.mutate(wp.id)}
      isCompleting={completeMut.isPending}
    />
  ) : view === "register" ? (
    <RegisterView
      rows={filtered}
      onOpen={setDetailWP}
      onEdit={canEdit ? handleEdit : null}
      onComplete={(wp) => completeMut.mutate(wp.id)}
      isCompleting={completeMut.isPending}
    />
  ) : (
    <HoursView
      rows={filtered}
      metrics={metrics}
      statusGroups={statusGroups}
      onOpen={setDetailWP}
    />
  );

  const emptyState = filtered.length === 0 ? (
    <div className="fab-empty-shell">
      <EmptyState
        icon="wp"
        title={metrics.totalCount === 0 ? "No fab packages tracked" : "No packages match this view"}
        body={
          metrics.totalCount === 0
            ? "Create a fabrication work package and link drawings so release readiness can be tracked."
            : "Clear filters or adjust the search to bring packages back into view."
        }
        cta={metrics.totalCount === 0 && canCreate ? (
          <Button variant="primary" icon="plus" onClick={handleOpenCreate} disabled={isAllocatingNumber}>
            New Package
          </Button>
        ) : null}
      />
    </div>
  ) : null;

  return (
    <div className="sb-dashboard-reference-page fab-release-page">
      <style>{FAB_RELEASE_STYLES}</style>
      <div style={{ padding: "0 24px" }}>
        <ListTruncationNotice count={workPackages.length} label="fab packages" />
      </div>
      <FabReleaseControlCenter
        projectName={projectName}
        metrics={metrics}
        stageFilter={stageFilter}
        onStageFilter={handleStageFilter}
        riskFilter={riskFilter}
        onRiskFilter={setRiskFilter}
        onOpenWP={setDetailWP}
        toolbar={(
          <Toolbar
            search={search}
            onSearch={setSearch}
            stageFilter={stageFilter}
            onStageFilter={handleStageFilter}
            riskFilter={riskFilter}
            onRiskFilter={setRiskFilter}
            view={view}
            onViewChange={handleViewChange}
            filteredCount={filtered.length}
            totalCount={metrics.totalCount}
            onClear={clearFilters}
            onExport={() => exportFabReleaseCSV(filtered)}
            onCreate={canCreate ? handleOpenCreate : null}
            createPending={isAllocatingNumber}
            sequenceFilterActive={Boolean(seqFilter)}
          />
        )}
        sequenceFilter={(
          <SequenceFilter items={workPackages} value={seqFilter} onChange={setSeqFilter} />
        )}
        stageFlow={(
          <StageFlowStrip
            metrics={metrics}
            stageFilter={stageFilter}
            onStageFilter={handleStageFilter}
          />
        )}
        exceptionRail={(
          <ExceptionRail
            metrics={metrics}
            onOpen={setDetailWP}
            onFilterRisk={setRiskFilter}
            onFilterStage={handleStageFilter}
          />
        )}
        viewHeader={(
          <ViewHeader
            view={view}
            filteredCount={filtered.length}
            totalCount={metrics.totalCount}
            onClear={clearFilters}
          />
        )}
        workflowBody={workflowBody}
        emptyState={emptyState}
      />
      {modals}
    </div>
  );
}
