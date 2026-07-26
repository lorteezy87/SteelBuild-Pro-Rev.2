/**
 * WorkPackages - production control surface for fabrication, delivery,
 * and erection packages.
 *
 * This page owns data access and mutations. Presentation is organized
 * around real execution questions: what is ready, what is blocked, what
 * is slipping, and what needs a human update next.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import WorkPackageDetailModalRaw from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModalRaw from "@/components/workpackages/WPFormModal";
import WPBulkAddModalRaw from "@/components/workpackages/WPBulkAddModal";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { withProjectId } from "@/lib/mutations/standardMutation";
import { batchProcess } from "@/utils/batchProcess";
import { BulkActionBar as BulkActionBarRaw } from "@/components/design-system";
import SequenceFilterRaw, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { exportWorkPackagesCSV } from "./workPackages/utils";
import { prepareBulkWorkPackageRows } from "./workPackages/creation";
import { buildWorkPackageMetrics, sortWorkPackagesForExecution } from "./workPackages/analytics";
import {
  ExceptionPanel,
  PhaseFlowView,
  RegisterView,
  StatusBoardView,
} from "./workPackages/components";
import type { WorkPackage } from "./workPackages/types";
import WpControlCenter from "./workPackages/WpControlCenter";
import { reconcileSelection } from "./workPackages/wpControlCenter.derive";
import { calcWpProgress } from "@/utils/projectKpis";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";

// The design-system primitives, LoadingSkeleton, and the workpackages
// modals/filter are still .jsx; their destructured `= []` prop defaults make
// TS infer `never[]` props. These boundary casts are removable once those
// shared/feature components are typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
const SequenceFilter = SequenceFilterRaw as unknown as ComponentType<AnyProps>;
const WPBulkAddModal = WPBulkAddModalRaw as unknown as ComponentType<AnyProps>;
const WPFormModal = WPFormModalRaw as unknown as ComponentType<AnyProps>;
const WorkPackageDetailModal = WorkPackageDetailModalRaw as unknown as ComponentType<AnyProps>;

export default function WorkPackages() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const { can } = usePermissions();

  const [view, setView] = useState("flow");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState<unknown>(null);
  const [editingWP, setEditingWP] = useState<WorkPackage | null>(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkPackage | null>(null);
  const [detailWP, setDetailWP] = useState<WorkPackage | null>(null);
  const [selectedWPs, setSelectedWPs] = useState<Set<string>>(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [allocatingNumber, setAllocatingNumber] = useState(false);

  const { data: rawWorkPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) return entities.WorkPackage.filter({ project_id: projectId });
      const all = await entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const liveProjectIds = useMemo(() => new Set(projects.map((p) => p.id).filter(Boolean)), [projects]);
  const selectedProject = projects.find((p) => p.id === projectId) || null;
  const effectiveProjectId = selectedProject?.id || null;
  const workPackages = useMemo(
    () => projectId
      ? (selectedProject ? rawWorkPackages : [])
      : rawWorkPackages.filter((wp) => wp?.project_id && liveProjectIds.has(wp.project_id)),
    [liveProjectIds, projectId, rawWorkPackages, selectedProject]
  );

  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: async () => {
      if (projectId) return entities.Drawing.filter({ project_id: projectId });
      return entities.Drawing.list();
    },
    staleTime: 30 * 1000,
  });

  const { data: projectDeliveries = [] } = useQuery({
    queryKey: ["deliveries-for-wps", projectId],
    queryFn: () => projectId
      ? entities.Delivery.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });

  const wpQueryKeys = [["work-packages", projectId], ["work-packages"], ["wps-all"]];

  useRealtimeInvalidation("work_packages", projectId, wpQueryKeys);

  const invalidateWps = () => {
    qc.invalidateQueries({ queryKey: ["work-packages"] });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
    // Fan out the full work_package family (incl. ["wps-fab", projectId] read by
    // FabRelease) so a WP mutation doesn't leave sibling pages stale.
    void invalidateEntity(qc, "work_package", projectId);
  };

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.WorkPackage.update(id, data),
    onSuccess: async (updated) => {
      replaceRecordInCaches(qc, wpQueryKeys, updated);
      invalidateWps();
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package updated");
      await invalidateCrudQueries(qc, wpQueryKeys);
    },
    onError: (err) => toastCrudError(err, "Failed to update work package"),
  });

  const createWPMut = useMutation({
    mutationFn: (data: any) => entities.WorkPackage.create(
      withProjectId(data as Record<string, unknown>, effectiveProjectId),
    ),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, wpQueryKeys, created, ((record, key) => !key[1] || record.project_id === key[1]) as any);
      invalidateWps();
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
      await invalidateCrudQueries(qc, wpQueryKeys);
    },
    onError: (err) => toastCrudError(err, "Failed to create work package"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.WorkPackage.delete(id),
    onSuccess: (_, deletedId) => {
      removeRecordFromCaches(qc, wpQueryKeys, deletedId);
      invalidateWps();
      setDeleteTarget(null);
      toast.success("Work package deleted");
    },
    onError: (err) => toastCrudError(err, "Failed to delete work package"),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (rows: any[]) => {
      const prepared = await prepareBulkWorkPackageRows(rows, effectiveProjectId, getNextNumber);
      return batchProcess(prepared, (data) => entities.WorkPackage.create(data), 5);
    },
    onSuccess: (results) => {
      invalidateWps();
      const ok = results.succeeded.length;
      const fail = results.failed.length;
      if (fail === 0) {
        toast.success(`Added ${ok} work package${ok === 1 ? "" : "s"}`);
        setBulkAddOpen(false);
      } else if (ok === 0) {
        toast.error(`All ${fail} failed: ${results.failed[0]?.error || "unknown error"}`);
      } else {
        toast.warning(`${ok} added, ${fail} failed`);
        setBulkAddOpen(false);
      }
    },
    onError: (err) => toastCrudError(err, "Bulk create failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const results = await batchProcess(ids, (id) => entities.WorkPackage.update(id, { status }));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results) => {
      invalidateWps();
      setSelectedWPs(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Status updated");
      }
    },
    onError: (err) => toastCrudError(err, "Bulk update failed"),
  });

  const metrics = useMemo(
    () => buildWorkPackageMetrics(workPackages, drawings, projectDeliveries),
    [workPackages, drawings, projectDeliveries]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics.enriched
      .filter((wp) => {
        if (phaseFilter !== "all" && wp._signals.phase !== phaseFilter) return false;
        if (statusFilter !== "all" && wp._signals.status !== statusFilter) return false;
        if (riskFilter !== "all" && wp._signals.risk !== riskFilter) return false;
        if (!matchesSequenceFilter(wp, seqFilter)) return false;
        if (!q) return true;
        return [
          wp.wp_number,
          wp.name,
          wp.project_name,
          wp.crew,
          wp.phase,
          wp.status,
          wp.notes,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      })
      .sort(sortWorkPackagesForExecution);
  }, [metrics.enriched, phaseFilter, statusFilter, riskFilter, seqFilter, search]);

  const selectedRows = useMemo(
    () => filtered.filter((wp) => selectedWPs.has(wp.id)),
    [filtered, selectedWPs]
  );

  useEffect(() => {
    setSelectedWPs((previous) => {
      const next = reconcileSelection(previous, filtered.map((wp) => wp.id));
      return next.size === previous.size ? previous : next;
    });
  }, [filtered]);

  const projectName = selectedProject?.name || (projectId ? "No active project" : "All Projects");

  // Project-level context for the canonical execution shell.
  const projectHealth = (selectedProject as unknown as { health_status?: string | null })?.health_status ?? null;
  const percentComplete =
    (selectedProject as unknown as { scope_complete_pct_override?: number | null })?.scope_complete_pct_override != null
      ? Number((selectedProject as unknown as { scope_complete_pct_override: number }).scope_complete_pct_override)
      : (workPackages.length ? calcWpProgress(workPackages).pct : null);

  const toggleSelect = (id: string) =>
    setSelectedWPs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleWPEdit = (wp: WorkPackage) => {
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = useCallback(async () => {
    if (allocatingNumber) return;
    setAllocatingNumber(true);
    let wpNumber = "";
    try {
      if (effectiveProjectId) {
        const n = await getNextNumber(effectiveProjectId, "wp_number");
        wpNumber = `WP-${String(n).padStart(3, "0")}`;
      } else {
        throw new Error("No active project selected");
      }
    } catch (err) {
      console.warn("[WorkPackages] getNextNumber failed:", err?.message);
      toast.error("Unable to reserve a work package number. Please retry.");
      return;
    } finally {
      setAllocatingNumber(false);
    }
    setEditingWP({ wp_number: wpNumber, project_id: effectiveProjectId ?? undefined });
    setWPModalOpen(true);
  }, [allocatingNumber, effectiveProjectId]);

  useAutoOpenCreate(handleWPCreate, { enabled: !!effectiveProjectId });

  if (wpLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const canCreate = !!effectiveProjectId && can("create", "work_package") && !allocatingNumber;
  const canEdit = can("edit", "work_package");
  const canDelete = can("delete", "work_package");

  const wpModals = (
    <>
      <WPBulkAddModal
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onCommit={(rows: unknown[]) => bulkCreateMut.mutate(rows)}
        projectId={effectiveProjectId}
        projectName={projectName}
        existingWPs={workPackages}
        isSaving={bulkCreateMut.isPending}
      />

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          open={wpModalOpen || !!editingWP}
          onClose={() => { setWPModalOpen(false); setEditingWP(null); }}
          onSave={(data: unknown) => {
            if (editingWP?.id) updateWPMut.mutate({ id: editingWP.id, data });
            else createWPMut.mutate(data);
          }}
          wp={editingWP}
          projects={projects}
          nextNumber={editingWP?.wp_number || ""}
          allDrawings={drawings}
          defaultProjectId={effectiveProjectId || ""}
        />
      )}

      {detailWP && (
        <WorkPackageDetailModal
          wp={detailWP}
          drawings={drawings}
          onClose={() => setDetailWP(null)}
          onEdit={(wp: WorkPackage) => { setDetailWP(null); handleWPEdit(wp); }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? This cannot be undone.`}
      />
    </>
  );

  const bulkActions = (
    <BulkActionBar
      count={selectedWPs.size}
      onClear={() => setSelectedWPs(new Set())}
      actions={[
        {
          label: "SET COMPLETE",
          icon: "check",
          onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "Complete" }),
          disabled: bulkStatusMut.isPending || selectedWPs.size === 0,
        },
        {
          label: "SET IN PROGRESS",
          icon: "arrow",
          onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "In Progress" }),
          disabled: bulkStatusMut.isPending || selectedWPs.size === 0,
        },
        {
          label: "EXPORT",
          icon: "download",
          onClick: () => exportWorkPackagesCSV(selectedRows),
          disabled: selectedRows.length === 0,
        },
      ]}
    />
  );

  return (
    <WpControlCenter
      projectName={projectName}
      workPackages={workPackages as unknown as Parameters<typeof WpControlCenter>[0]["workPackages"]}
      filtered={filtered as unknown as Parameters<typeof WpControlCenter>[0]["filtered"]}
      metrics={metrics as unknown as Parameters<typeof WpControlCenter>[0]["metrics"]}
      view={view}
      onViewChange={setView}
      search={search}
      onSearch={setSearch}
      phaseFilter={phaseFilter}
      onPhaseFilter={setPhaseFilter}
      statusFilter={statusFilter}
      onStatusFilter={setStatusFilter}
      riskFilter={riskFilter}
      onRiskFilter={setRiskFilter}
      onClearFilters={() => {
        setSearch("");
        setPhaseFilter("all");
        setStatusFilter("all");
        setRiskFilter("all");
        setSeqFilter(null);
      }}
      filteredCount={filtered.length}
      totalCount={metrics.totalCount}
      onOpenWp={setDetailWP as unknown as Parameters<typeof WpControlCenter>[0]["onOpenWp"]}
      onExport={() => exportWorkPackagesCSV(filtered)}
      onBulkAdd={() => setBulkAddOpen(true)}
      onCreate={canCreate ? handleWPCreate : null}
      canCreate={canCreate}
      selectedIds={selectedWPs}
      onToggleSelect={toggleSelect}
      onToggleAll={(checked) =>
        setSelectedWPs(checked ? new Set(filtered.map((w) => w.id)) : new Set())
      }
      projectHealth={projectHealth}
      percentComplete={percentComplete}
      sequenceFilter={<SequenceFilter items={workPackages} value={seqFilter} onChange={setSeqFilter} />}
      exceptionPanel={
        <ExceptionPanel
          metrics={metrics}
          onRiskFilter={setRiskFilter}
          onStatusFilter={setStatusFilter}
          onPhaseFilter={setPhaseFilter}
          onOpen={setDetailWP}
        />
      }
      listTruncationNotice={<ListTruncationNotice count={rawWorkPackages.length} label="work packages" />}
      bulkActions={bulkActions}
      modals={wpModals}
    >
      <main style={{ minWidth: 0 }}>
        {view === "flow" && (
          <PhaseFlowView
            rows={filtered}
            phaseRollup={metrics.phaseRollup}
            onOpen={setDetailWP}
            onEdit={canEdit ? handleWPEdit : null}
            onDelete={canDelete ? setDeleteTarget : null}
            selectedWPs={selectedWPs}
            onToggleSelect={toggleSelect}
          />
        )}

        {view === "board" && (
          <StatusBoardView
            rows={filtered}
            onOpen={setDetailWP}
            onEdit={canEdit ? handleWPEdit : null}
            onDelete={canDelete ? setDeleteTarget : null}
          />
        )}

        {view === "register" && (
          <RegisterView
            rows={filtered}
            selectedWPs={selectedWPs}
            onToggleSelect={toggleSelect}
            onOpen={setDetailWP}
            onEdit={canEdit ? handleWPEdit : null}
            onDelete={canDelete ? setDeleteTarget : null}
          />
        )}
      </main>
    </WpControlCenter>
  );
}
