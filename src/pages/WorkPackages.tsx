/**
 * WorkPackages - production control surface for fabrication, delivery,
 * and erection packages.
 *
 * This page owns data access and mutations. Presentation is organized
 * around real execution questions: what is ready, what is blocked, what
 * is slipping, and what needs a human update next.
 */

import { useCallback, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
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
import { batchProcess } from "@/utils/batchProcess";
import { BulkActionBar as BulkActionBarRaw } from "@/components/design-system";
import SequenceFilterRaw, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { exportWorkPackagesCSV } from "./workPackages/utils";
import { buildWorkPackageMetrics, sortWorkPackagesForExecution } from "./workPackages/analytics";
import { RESPONSIVE_CSS, contentGridStyle, pageStyle } from "./workPackages/styles";
import {
  ControlPanel,
  ExceptionPanel,
  Hero,
  PhaseFlowView,
  RegisterView,
  StatusBoardView,
  SummaryStrip,
} from "./workPackages/components";
import type { WorkPackage } from "./workPackages/types";
import { useFlag } from "@/hooks/useFeatureFlag";
import WpControlCenter from "./workPackages/WpControlCenter";
import { calcWpProgress } from "@/utils/projectKpis";

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
  const commandUi = useFlag("command_ui");

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
    mutationFn: (data: any) => entities.WorkPackage.create(data),
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
      if (!rows?.length) throw new Error("No rows to add");
      if (!effectiveProjectId) throw new Error("Select a project first");
      const needsNumbers = rows.filter((row) => !row.wp_number);
      let nextStart: number | null = null;
      if (needsNumbers.length > 0) {
        try {
          nextStart = await getNextNumber(effectiveProjectId, "wp_number");
        } catch (err) {
          console.warn("[WorkPackages] getNextNumber fallback:", err?.message);
          const maxNum = workPackages
            .map((wp) => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
            .filter((n) => !Number.isNaN(n))
            .reduce((max, n) => Math.max(max, n), 0);
          nextStart = maxNum + 1;
        }
      }
      let cursor = nextStart;
      const prepared = rows.map((row) => {
        let wpNumber = row.wp_number;
        if (!wpNumber && cursor != null) {
          wpNumber = `WP-${String(cursor).padStart(3, "0")}`;
          cursor += 1;
        }
        return { ...row, wp_number: wpNumber, project_id: effectiveProjectId, project_name: row.project_name || undefined };
      });
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

  const projectName = selectedProject?.name || (projectId ? "No active project" : "All Projects");

  // Project-level context for the Command UI hero (mirrors RFIs.jsx pattern).
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
    let wpNumber = "";
    try {
      if (effectiveProjectId) {
        const n = await getNextNumber(effectiveProjectId, "wp_number");
        wpNumber = `WP-${String(n).padStart(3, "0")}`;
      }
    } catch (err) {
      console.warn("[WorkPackages] getNextNumber fallback:", err?.message);
      const maxNum = workPackages
        .map((wp) => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
        .filter((n) => !Number.isNaN(n))
        .reduce((max, n) => Math.max(max, n), 0);
      wpNumber = `WP-${String(maxNum + 1).padStart(3, "0")}`;
    }
    setEditingWP({ wp_number: wpNumber, project_id: effectiveProjectId ?? undefined });
    setWPModalOpen(true);
  }, [effectiveProjectId, workPackages]);

  useAutoOpenCreate(handleWPCreate, { enabled: !!effectiveProjectId });

  if (wpLoading) {
    return (
      <div className="sb-dashboard-reference-page" style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Command UI skin (flag: command_ui)
  // Passes all pre-computed state + handlers down to the presentation layer.
  // Modals (WPFormModal, WPBulkAddModal, DeleteDialog, WorkPackageDetailModal)
  // remain here so they stay in the container's mutation scope.
  // ---------------------------------------------------------------------------
  if (commandUi) {
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

    return (
      <div className="wp-page">
        <WpControlCenter
          projectName={projectName}
          workPackages={workPackages as unknown as Parameters<typeof WpControlCenter>[0]["workPackages"]}
          filtered={filtered as unknown as Parameters<typeof WpControlCenter>[0]["filtered"]}
          metrics={metrics as unknown as Parameters<typeof WpControlCenter>[0]["metrics"]}
          search={search}
          onSearch={setSearch}
          phaseFilter={phaseFilter}
          onPhaseFilter={setPhaseFilter}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          riskFilter={riskFilter}
          onRiskFilter={setRiskFilter}
          onOpenWp={setDetailWP as unknown as Parameters<typeof WpControlCenter>[0]["onOpenWp"]}
          onExport={() => exportWorkPackagesCSV(filtered)}
          onCreate={can("create", "work_package") ? handleWPCreate : null}
          selectedIds={selectedWPs}
          onToggleSelect={toggleSelect}
          onToggleAll={(checked) =>
            setSelectedWPs(checked ? new Set(filtered.map((w) => w.id)) : new Set())
          }
          projectHealth={projectHealth}
          percentComplete={percentComplete}
        />

        <BulkActionBar
          count={selectedWPs.size}
          onClear={() => setSelectedWPs(new Set())}
          actions={[
            {
              label: "SET COMPLETE",
              icon: "check",
              onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "Complete" }),
              disabled: bulkStatusMut.isPending,
            },
            {
              label: "SET IN PROGRESS",
              icon: "arrow",
              onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "In Progress" }),
              disabled: bulkStatusMut.isPending,
            },
            {
              label: "EXPORT",
              icon: "download",
              onClick: () => exportWorkPackagesCSV(selectedRows),
            },
          ]}
        />

        {wpModals}
      </div>
    );
  }

  return (
    <div className="sb-dashboard-reference-page" style={pageStyle}>
      <style>{RESPONSIVE_CSS}</style>
      <Hero
        projectName={projectName}
        metrics={metrics}
        view={view}
        onViewChange={setView}
        onExport={() => exportWorkPackagesCSV(filtered)}
        onBulkAdd={() => setBulkAddOpen(true)}
        onCreate={handleWPCreate}
        canCreate={!!effectiveProjectId && can("create", "work_package")}
      />

      <SummaryStrip metrics={metrics} onPhaseFilter={setPhaseFilter} phaseFilter={phaseFilter} />

      <ControlPanel
        search={search}
        onSearch={setSearch}
        phaseFilter={phaseFilter}
        onPhaseFilter={setPhaseFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        riskFilter={riskFilter}
        onRiskFilter={setRiskFilter}
        filteredCount={filtered.length}
        totalCount={metrics.totalCount}
        onClear={() => {
          setSearch("");
          setPhaseFilter("all");
          setStatusFilter("all");
          setRiskFilter("all");
          setSeqFilter(null);
        }}
      />

      <SequenceFilter items={workPackages} value={seqFilter} onChange={setSeqFilter} />

      <div className="wp-content-grid" style={contentGridStyle}>
        <ExceptionPanel
          metrics={metrics}
          onRiskFilter={setRiskFilter}
          onStatusFilter={setStatusFilter}
          onPhaseFilter={setPhaseFilter}
          onOpen={setDetailWP}
        />

        <main style={{ minWidth: 0 }}>
          {view === "flow" && (
            <PhaseFlowView
              rows={filtered}
              phaseRollup={metrics.phaseRollup}
              onOpen={setDetailWP}
              onEdit={can("edit", "work_package") ? handleWPEdit : null}
              onDelete={can("delete", "work_package") ? setDeleteTarget : null}
              selectedWPs={selectedWPs}
              onToggleSelect={toggleSelect}
            />
          )}

          {view === "board" && (
            <StatusBoardView
              rows={filtered}
              onOpen={setDetailWP}
              onEdit={can("edit", "work_package") ? handleWPEdit : null}
              onDelete={can("delete", "work_package") ? setDeleteTarget : null}
            />
          )}

          {view === "register" && (
            <RegisterView
              rows={filtered}
              selectedWPs={selectedWPs}
              onToggleSelect={toggleSelect}
              onOpen={setDetailWP}
              onEdit={can("edit", "work_package") ? handleWPEdit : null}
              onDelete={can("delete", "work_package") ? setDeleteTarget : null}
            />
          )}
        </main>
      </div>

      <BulkActionBar
        count={selectedWPs.size}
        onClear={() => setSelectedWPs(new Set())}
        actions={[
          {
            label: "SET COMPLETE",
            icon: "check",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "Complete" }),
            disabled: bulkStatusMut.isPending,
          },
          {
            label: "SET IN PROGRESS",
            icon: "arrow",
            onClick: () => bulkStatusMut.mutate({ ids: [...selectedWPs], status: "In Progress" }),
            disabled: bulkStatusMut.isPending,
          },
          {
            label: "EXPORT",
            icon: "download",
            onClick: () => exportWorkPackagesCSV(selectedRows),
          },
        ]}
      />

      <WPBulkAddModal
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onCommit={(rows) => bulkCreateMut.mutate(rows)}
        projectId={effectiveProjectId}
        projectName={projectName}
        existingWPs={workPackages}
        isSaving={bulkCreateMut.isPending}
      />

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          open={wpModalOpen || !!editingWP}
          onClose={() => { setWPModalOpen(false); setEditingWP(null); }}
          onSave={(data) => {
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
          onEdit={(wp) => { setDetailWP(null); handleWPEdit(wp); }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget?.id) deleteMut.mutate(deleteTarget.id); }}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? This cannot be undone.`}
      />
    </div>
  );
}
