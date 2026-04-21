/**
 * WorkPackages — steel fab/erection work-package dashboard.
 *
 * After the carve-up this file owns:
 *   1. React-Query fetches for `work_packages`, `projects`, `drawings`.
 *   2. All mutations: create / update / delete / quick-complete,
 *      bulk-create from CSV, bulk-set-status.
 *   3. Derived data — filtered list, status/tonnage stats, per-phase
 *      tonnage rollup, drawings-by-stage aggregation, overdue list.
 *   4. Composition of feature-folder components in `./workPackages/`.
 *
 * Every visual block lives in `./workPackages/*.jsx` — header bar,
 * KPI tiles, tonnage bar, filter bar, bulk-action bar, board view,
 * drawing tracker, plus constants/utils/PhaseIcon.
 */

import React, { useMemo, useState } from "react";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import WorkPackageList from "@/components/workpackages/WorkPackageList";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import WPBulkAddModal from "@/components/workpackages/WPBulkAddModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { batchProcess } from "@/utils/batchProcess";

import {
  PHASES,
  PHASE_COLORS,
  PHASE_HEX,
} from "./workPackages/constants";
import { exportWorkPackagesCSV } from "./workPackages/utils";
import HeaderBar from "./workPackages/HeaderBar";
import KpiTile from "./workPackages/KpiTile";
import TonnageBar from "./workPackages/TonnageBar";
import FilterBar from "./workPackages/FilterBar";
import BulkActionBar from "./workPackages/BulkActionBar";
import BoardView from "./workPackages/BoardView";
import DrawingTracker from "./workPackages/DrawingTracker";

export default function WorkPackages() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [search, setSearch] = useState("");
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [expandedWP, setExpandedWP] = useState(null);
  const [drawingStageFilter, setDrawingStageFilter] = useState("all");
  const [selectedBoardWP, setSelectedBoardWP] = useState(null);
  const [compact, setCompact] = useState(false);
  const [selectedWPs, setSelectedWPs] = useState(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  /* ── Queries ── */
  const { data: workPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) {
        return base44.entities.WorkPackage.filter({ project_id: projectId });
      }
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => (projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
  });

  /* ── Mutations ── */
  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createWPMut = useMutation({
    mutationFn: (data) => base44.entities.WorkPackage.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
    },
    onError: (err) => toast.error(err.message),
  });

  const quickCompleteMut = useMutation({
    mutationFn: (id) =>
      base44.entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      toast.success("Work package marked complete");
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.WorkPackage.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setDeleteTarget(null);
      toast.success("Work package deleted");
    },
    onError: () => toast.error("Delete failed"),
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (rows) => {
      if (!rows || rows.length === 0) throw new Error("No rows to add");
      if (!projectId) throw new Error("Select a project first");

      // Single sequence-advance for the whole batch rather than hitting
      // getNextNumber N times (which would thrash the sequence row).
      const rowsNeedingNumbers = rows.filter((r) => !r.wp_number);
      let nextStart = null;
      if (rowsNeedingNumbers.length > 0) {
        try {
          nextStart = await getNextNumber(projectId, "wp_number");
        } catch (err) {
          console.warn("[WorkPackages] bulk: getNextNumber failed, falling back", err?.message);
          const maxNum = workPackages
            .map((wp) => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
            .filter((n) => !isNaN(n))
            .reduce((max, n) => Math.max(max, n), 0);
          nextStart = maxNum + 1;
        }
      }

      let autoCursor = nextStart;
      const prepared = rows.map((row) => {
        let wp_number = row.wp_number;
        if (!wp_number && autoCursor != null) {
          wp_number = `WP-${String(autoCursor).padStart(3, "0")}`;
          autoCursor += 1;
        }
        return {
          ...row,
          wp_number,
          project_id: projectId,
          // Strip undefined project_name so Supabase doesn't overwrite defaults.
          project_name: row.project_name || undefined,
        };
      });

      return batchProcess(prepared, (data) => base44.entities.WorkPackage.create(data), 5);
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
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
    onError: (err) => toast.error(err.message || "Bulk create failed"),
  });

  const bulkStatusMut = useMutation({
    mutationFn: async ({ ids, status }) => {
      const results = await batchProcess(ids, (id) => base44.entities.WorkPackage.update(id, { status }));
      if (results.failed.length > 0 && results.succeeded.length === 0) {
        throw new Error(`All ${results.failed.length} updates failed.`);
      }
      return results;
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["work-packages"] });
      qc.invalidateQueries({ queryKey: ["wps-all"] });
      setSelectedWPs(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Status updated");
      }
    },
    onError: () => toast.error("Bulk update failed"),
  });

  /* ── Helpers ── */
  const toggleSelectWP = (id) =>
    setSelectedWPs((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleSelectAll = () =>
    setSelectedWPs(
      selectedWPs.size === filtered.length ? new Set() : new Set(filtered.map((w) => w.id))
    );

  const handleWPEdit = (wp) => {
    if (wp?._quickComplete) {
      quickCompleteMut.mutate(wp.id);
      return;
    }
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = async () => {
    let wpNumber = "";
    try {
      if (projectId) {
        const nextNum = await getNextNumber(projectId, "wp_number");
        wpNumber = `WP-${String(nextNum).padStart(3, "0")}`;
      }
    } catch (err) {
      console.warn("[WorkPackages] Failed to allocate WP number:", err?.message);
      const maxNum = workPackages
        .map((wp) => parseInt((wp.wp_number || "").replace(/\D/g, ""), 10))
        .filter((n) => !isNaN(n))
        .reduce((max, n) => Math.max(max, n), 0);
      wpNumber = `WP-${String(maxNum + 1).padStart(3, "0")}`;
    }
    setEditingWP({ wp_number: wpNumber, project_id: projectId });
    setWPModalOpen(true);
  };

  const handleExportCSV = () => {
    const toExport = selectedWPs.size > 0 ? filtered.filter((w) => selectedWPs.has(w.id)) : filtered;
    exportWorkPackagesCSV(toExport);
  };

  const handleClearFilters = () => {
    setFilterStatus("all");
    setFilterPhase("all");
    setSearch("");
  };

  /* ── Derived ── */
  const filtered = useMemo(() => {
    return workPackages.filter((wp) => {
      const statusMatch = filterStatus === "all" || wp.status === filterStatus;
      const phaseMatch = filterPhase === "all" || wp.phase === filterPhase;
      const q = search.toLowerCase();
      const searchMatch =
        !q ||
        (wp.name || "").toLowerCase().includes(q) ||
        (wp.wp_number || "").toLowerCase().includes(q) ||
        (wp.crew || "").toLowerCase().includes(q) ||
        (wp.area || "").toLowerCase().includes(q) ||
        (wp.sequence || "").toLowerCase().includes(q) ||
        (wp.linked_drawing_ids || "").toLowerCase().includes(q);
      return statusMatch && phaseMatch && searchMatch;
    });
  }, [workPackages, filterStatus, filterPhase, search]);

  const stats = useMemo(() => {
    const totalTons = workPackages.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    return {
      total: workPackages.length,
      notStarted: workPackages.filter((w) => w.status === "Not Started").length,
      inProgress: workPackages.filter((w) => w.status === "In Progress").length,
      complete: workPackages.filter((w) => w.status === "Complete").length,
      onHold: workPackages.filter((w) => w.status === "On Hold").length,
      totalTons,
      fabTons: workPackages
        .filter((w) => w.phase === "Fabrication")
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      erectedTons: workPackages
        .filter((w) => w.phase === "Erection" && w.status === "Complete")
        .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
      avgProgress:
        workPackages.length > 0
          ? Math.round(
              workPackages.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / workPackages.length
            )
          : 0,
    };
  }, [workPackages]);

  const phaseTons = useMemo(
    () =>
      PHASES.map((phase) => ({
        phase,
        tons: workPackages.filter((w) => w.phase === phase).reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
        completeTons: workPackages
          .filter((w) => w.phase === phase && w.status === "Complete")
          .reduce((s, w) => s + (Number(w.tonnage) || 0), 0),
        color: PHASE_COLORS[phase],
        hex: PHASE_HEX[phase],
      })),
    [workPackages]
  );

  const activeFilterCount = (filterStatus !== "all" ? 1 : 0) + (filterPhase !== "all" ? 1 : 0);
  const projectName = projects.find((p) => p.id === projectId)?.name;

  if (wpLoading) {
    return (
      <div style={{ padding: 24, height: "calc(100vh - 92px)" }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const toggleKpiStatusFilter = (statusKey) =>
    setFilterStatus(filterStatus === statusKey ? "all" : statusKey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, height: "calc(100vh - 92px)", overflow: "auto" }}>
      <HeaderBar
        projectId={projectId}
        projectName={projectName}
        workPackageCount={workPackages.length}
        totalTons={stats.totalTons}
        view={view}
        onViewChange={setView}
        compact={compact}
        onToggleCompact={() => setCompact((v) => !v)}
        onExportCSV={handleExportCSV}
        onBulkAdd={() => setBulkAddOpen(true)}
        onCreate={handleWPCreate}
      />

      {/* KPI strip — status-filter tiles + tonnage/progress summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <KpiTile label="TOTAL WPS"     value={stats.total}      color="var(--accent)"          statusKey={null}          filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
        <KpiTile label="NOT STARTED"   value={stats.notStarted} color="var(--text-muted)"       statusKey="Not Started"   filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
        <KpiTile label="IN PROGRESS"   value={stats.inProgress} color="var(--status-warning)"   statusKey="In Progress"   filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
        <KpiTile label="COMPLETE"      value={stats.complete}   color="var(--status-success)"   statusKey="Complete"      filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
        <KpiTile label="ON HOLD"       value={stats.onHold}     color="var(--status-error)"     statusKey="On Hold"       filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
        <KpiTile label="TOTAL TONNAGE" value={`${stats.totalTons.toFixed(1)}T`} color="var(--status-info)" statusKey={null} filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
        <KpiTile label="AVG PROGRESS"  value={`${stats.avgProgress}%`}          color="var(--accent)"       statusKey={null} filterStatus={filterStatus} onToggle={toggleKpiStatusFilter} />
      </div>

      <TonnageBar phaseTons={phaseTons} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filterPhase={filterPhase}
        onPhaseChange={setFilterPhase}
        filterStatus={filterStatus}
        onStatusChange={setFilterStatus}
        activeFilterCount={activeFilterCount}
        onClear={handleClearFilters}
      />

      <BulkActionBar
        count={selectedWPs.size}
        isUpdating={bulkStatusMut.isPending}
        onSetStatus={(status) => bulkStatusMut.mutate({ ids: [...selectedWPs], status })}
        onExport={handleExportCSV}
        onClear={() => setSelectedWPs(new Set())}
      />

      {/* View switch */}
      {view === "list" && (
        <WorkPackageList
          workPackages={filtered}
          drawings={drawings}
          expandedWP={expandedWP}
          onExpand={(wp) => setExpandedWP(expandedWP?.id === wp.id ? null : wp)}
          onEdit={handleWPEdit}
          onDelete={setDeleteTarget}
          showProject={!projectId}
          compact={compact}
          selected={selectedWPs}
          onToggleSelect={toggleSelectWP}
          onSelectAll={toggleSelectAll}
          onCreateWP={handleWPCreate}
        />
      )}

      {view === "board" && (
        <BoardView
          filtered={filtered}
          onSelect={setSelectedBoardWP}
          onEdit={handleWPEdit}
          onDelete={setDeleteTarget}
        />
      )}

      {view === "drawings" && (
        <DrawingTracker
          projectId={projectId}
          drawings={drawings}
          workPackages={workPackages}
          stageFilter={drawingStageFilter}
          onStageFilterChange={setDrawingStageFilter}
        />
      )}

      {/* Modals */}
      <WPBulkAddModal
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        onCommit={(rows) => bulkCreateMut.mutate(rows)}
        projectId={projectId}
        projectName={projectName}
        existingWPs={workPackages}
        isSaving={bulkCreateMut.isPending}
      />

      {(wpModalOpen || editingWP) && (
        <WPFormModal
          open={wpModalOpen || !!editingWP}
          onClose={() => {
            setWPModalOpen(false);
            setEditingWP(null);
          }}
          onSave={(data) => {
            if (editingWP?.id) {
              updateWPMut.mutate({ id: editingWP.id, data });
            } else {
              createWPMut.mutate(data);
            }
          }}
          wp={editingWP}
          projects={projects}
          nextNumber={editingWP?.wp_number || ""}
          allDrawings={drawings}
        />
      )}

      {selectedBoardWP && (
        <WorkPackageDetailModal
          wp={selectedBoardWP}
          drawings={drawings}
          onClose={() => setSelectedBoardWP(null)}
          onEdit={(wp) => {
            setSelectedBoardWP(null);
            handleWPEdit(wp);
          }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? This cannot be undone.`}
      />
    </div>
  );
}
