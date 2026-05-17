/**
 * FabRelease - shop release control surface for structural steel packages.
 *
 * The page answers the execution questions that matter before and during
 * fabrication: what is ready to release, what is blocked, what is in the shop,
 * and what is ready for logistics.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Factory,
  Filter,
  Gauge,
  Hammer,
  LayoutGrid,
  List,
  PackageCheck,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { invalidateEntity, getQueryKey } from "@/services/cacheRegistry";
import DeleteDialog from "@/components/shared/DeleteDialog";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import { getNextNumber } from "@/components/shared/numberSequencing";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import WPFormModal from "@/components/workpackages/WPFormModal";
import { Button, EmptyState, ProgressBar, StatusPill } from "@/components/design-system";
import { formatDrawingSetNumber } from "@/lib/drawingSetOrdering";
import {
  BOARD_LANES,
  FAB_STAGES,
  STATUS_ORDER,
  buildFabReleaseMetrics,
  fabReleaseLane,
  getWorkPackageDisplayName,
  sortFabPackagesForRelease,
} from "./fabRelease/analytics";

const VIEW_OPTIONS = [
  { id: "flow", label: "Flow", icon: LayoutGrid },
  { id: "board", label: "Board", icon: ClipboardCheck },
  { id: "register", label: "Register", icon: List },
  { id: "hours", label: "Hours", icon: Gauge },
];

const RISK_FILTERS = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

const STAGE_FILTERS = [
  { id: "all", label: "All Stages" },
  ...FAB_STAGES.map((stage) => ({ id: stage.id, label: stage.label })),
];

const BOARD_TONE = {
  Blocked: "var(--status-error)",
  "Ready For Release": "var(--status-success)",
  Released: "var(--status-warning)",
  "In Shop": "var(--phase-fab)",
  "Ready To Ship": "var(--phase-delivery)",
};

const STATUS_TONE = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

const display = { fontFamily: "var(--font-display)" };
const mono = { fontFamily: "var(--font-mono)" };

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTons(value) {
  return `${num(value).toFixed(1)}T`;
}

function formatHours(value) {
  return `${Math.round(num(value)).toLocaleString()}h`;
}

function formatDate(value, fallback = "TBD") {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stageMeta(stageId) {
  return FAB_STAGES.find((stage) => stage.id === stageId) || FAB_STAGES[0];
}

function stageColor(stageId) {
  return stageMeta(stageId).color;
}

function riskColor(risk) {
  if (risk === "high") return "var(--status-error)";
  if (risk === "medium") return "var(--status-warning)";
  return "var(--status-success)";
}

function drawingPackageLabel(pkg) {
  const number = formatDrawingSetNumber(pkg);
  const name = pkg.set_name || pkg.name || "Drawing package";
  return number && number !== "TBD" ? `${number} - ${name}` : name;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportFabReleaseCSV(rows, fileName = "fab-release.csv") {
  const headers = [
    "WP Number",
    "Name",
    "Stage",
    "Status",
    "Tons",
    "Progress",
    "Readiness",
    "Risk",
    "Crew",
    "Released Date",
    "Drawing Packages",
    "Flags",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((wp) => [
      wp.wp_number,
      getWorkPackageDisplayName(wp),
      stageMeta(wp._signals.stage).label,
      wp._signals.status,
      num(wp.tonnage).toFixed(1),
      wp._signals.progress,
      wp._signals.readinessScore,
      wp._signals.risk,
      wp.crew,
      wp.released_date,
      wp._signals.drawing.packages.map(drawingPackageLabel).join("; "),
      wp._signals.flags.map((flag) => flag.label).join("; "),
    ].map(escapeCsv).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

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
  const [detailWP, setDetailWP] = useState(null);
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    const savedView = localStorage.getItem("fabReleaseView");
    const savedStage = localStorage.getItem("fabReleaseStage");
    if (savedView && VIEW_OPTIONS.some((option) => option.id === savedView)) setView(savedView);
    if (savedStage && STAGE_FILTERS.some((option) => option.id === savedStage)) setStageFilter(savedStage);

    const urlView = searchParams.get("view");
    const urlStage = searchParams.get("stage");
    const normalizedView = urlView === "pipeline" ? "flow" : urlView === "list" ? "register" : urlView;
    if (normalizedView && VIEW_OPTIONS.some((option) => option.id === normalizedView)) {
      setView(normalizedView);
    }
    if (urlStage) {
      const matched = urlStage === "all"
        ? "all"
        : FAB_STAGES.find((stage) =>
            stage.id === urlStage || stage.short.toLowerCase() === urlStage.toLowerCase()
          )?.id;
      if (matched) setStageFilter(matched);
    }
  }, [searchParams]);

  const { data: workPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["wps-fab", projectId],
    queryFn: () => (projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: drawings = [], isLoading: drawingLoading } = useQuery({
    queryKey: ["drawings", projectId],
    queryFn: () => (projectId ? base44.entities.Drawing.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: drawingSets = [] } = useQuery({
    queryKey: ["drawing-sets", projectId],
    queryFn: () => (projectId ? base44.entities.DrawingSet.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId],
    queryFn: () => (projectId ? base44.entities.RFI.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () => (projectId ? base44.entities.Delivery.filter({ project_id: projectId }) : []),
    enabled: !!projectId,
    staleTime: 30000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const project = projects.find((item) => item.id === projectId) || activeProject || null;
  const projectName = project?.project_name || project?.name || "Project";

  const wpQueryKeys = [["work-packages", projectId], ["work_packages", projectId], getQueryKey("work_package", projectId)];
  useRealtimeInvalidation("work_packages", projectId, wpQueryKeys);

  const invalidateWorkPackages = () => invalidateEntity(qc, "work_package", projectId);

  const createWPMut = useMutation({
    mutationFn: (data) => base44.entities.WorkPackage.create(data),
    onSuccess: async (created) => {
      appendRecordToCaches(qc, wpQueryKeys, created, (record, key) => !key[1] || record.project_id === key[1]);
      await invalidateWorkPackages();
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Fab package created");
    },
    onError: (e) => toastCrudError(e, "Failed to create fab package"),
  });

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: async (updated, variables) => {
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
    mutationFn: (id) => base44.entities.WorkPackage.delete(id),
    onSuccess: async (_, deletedId) => {
      removeRecordFromCaches(qc, wpQueryKeys, deletedId);
      await invalidateWorkPackages();
      setDetailWP((prev) => (prev?.id === deletedId ? null : prev));
      setDeleteTarget(null);
      toast.success("Fab package deleted");
    },
    onError: (e) => toastCrudError(e, "Failed to delete fab package"),
  });

  const completeMut = useMutation({
    mutationFn: (id) =>
      base44.entities.WorkPackage.update(id, {
        status: "Complete",
        percent_complete: 100,
      }),
    onSuccess: async (updated, id) => {
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

  const metrics = useMemo(
    () => buildFabReleaseMetrics(workPackages, drawings, drawingSets, { rfisByWpId, deliveriesByWpId }),
    [drawingSets, drawings, workPackages, rfisByWpId, deliveriesByWpId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics.enriched
      .filter((wp) => {
        const signals = wp._signals;
        if (stageFilter !== "all" && signals.stage !== stageFilter) return false;
        if (riskFilter !== "all" && signals.risk !== riskFilter) return false;
        if (!q) return true;
        const haystack = [
          wp.wp_number,
          wp.name,
          wp.project_name,
          wp.crew,
          wp.status,
          wp.phase,
          wp.notes,
          stageMeta(signals.stage).label,
          ...signals.drawing.packageNames,
          ...signals.flags.map((flag) => flag.label),
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .sort(sortFabPackagesForRelease);
  }, [metrics.enriched, riskFilter, search, stageFilter]);

  const laneGroups = useMemo(() => {
    const groups = Object.fromEntries(BOARD_LANES.map((lane) => [lane, []]));
    for (const wp of filtered) {
      const lane = fabReleaseLane(wp);
      if (groups[lane]) groups[lane].push(wp);
      else groups.Blocked.push(wp);
    }
    return groups;
  }, [filtered]);

  const statusGroups = useMemo(() => {
    const groups = Object.fromEntries(STATUS_ORDER.map((status) => [status, []]));
    for (const wp of filtered) {
      const status = STATUS_ORDER.includes(wp._signals.status) ? wp._signals.status : "Not Started";
      groups[status].push(wp);
    }
    return groups;
  }, [filtered]);

  const handleViewChange = (nextView) => {
    setView(nextView);
    localStorage.setItem("fabReleaseView", nextView);
  };

  const handleStageFilter = (nextStage) => {
    setStageFilter(nextStage);
    localStorage.setItem("fabReleaseStage", nextStage);
  };

  const handleOpenCreate = async () => {
    if (!projectId) return;
    let wpNumber = "";
    try {
      const nextNumber = await getNextNumber(projectId, "wp_number");
      wpNumber = `WP-${String(nextNumber).padStart(3, "0")}`;
    } catch (err) {
      console.warn("[FabRelease] getNextNumber fallback:", err?.message);
      const maxNumber = workPackages
        .map((wp) => parseInt(String(wp.wp_number || "").replace(/\D/g, ""), 10))
        .filter((value) => !Number.isNaN(value))
        .reduce((max, value) => Math.max(max, value), 0);
      wpNumber = `WP-${String(maxNumber + 1).padStart(3, "0")}`;
    }
    setDetailWP(null);
    setEditingWP({
      wp_number: wpNumber,
      project_id: projectId,
      project_name: projectName,
      phase: "Fabrication",
      status: "Not Started",
    });
    setWPModalOpen(true);
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
    if (editingWP?.id) updateWPMut.mutate({ id: editingWP.id, data: payload });
    else createWPMut.mutate(payload);
  };

  const clearFilters = () => {
    setSearch("");
    setStageFilter("all");
    setRiskFilter("all");
    localStorage.setItem("fabReleaseStage", "all");
  };

  if (!projectId) {
    return (
      <div className="fab-release-page">
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
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  return (
    <div className="fab-release-page">
      <style>{FAB_RELEASE_STYLES}</style>

      <Hero
        projectName={projectName}
        metrics={metrics}
        view={view}
        onViewChange={handleViewChange}
        onExport={() => exportFabReleaseCSV(filtered)}
        onCreate={can("create", "work_package") ? handleOpenCreate : null}
      />

      <SummaryStrip metrics={metrics} onStageFilter={handleStageFilter} stageFilter={stageFilter} />

      <StageFlowStrip
        metrics={metrics}
        stageFilter={stageFilter}
        onStageFilter={handleStageFilter}
      />

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
      />

      <section className="fab-release-layout">
        <ExceptionRail
          metrics={metrics}
          onOpen={setDetailWP}
          onFilterRisk={setRiskFilter}
          onFilterStage={handleStageFilter}
        />

        <main className="fab-release-main">
          <ViewHeader
            view={view}
            filteredCount={filtered.length}
            totalCount={metrics.totalCount}
            onClear={clearFilters}
          />

          {view === "flow" && (
            <FlowView
              rows={filtered}
              stageRollup={metrics.stageRollup}
              onOpen={setDetailWP}
              onEdit={handleEdit}
              onComplete={(wp) => completeMut.mutate(wp.id)}
              isCompleting={completeMut.isPending}
            />
          )}

          {view === "board" && (
            <BoardView
              laneGroups={laneGroups}
              onOpen={setDetailWP}
              onEdit={handleEdit}
              onComplete={(wp) => completeMut.mutate(wp.id)}
              isCompleting={completeMut.isPending}
            />
          )}

          {view === "register" && (
            <RegisterView
              rows={filtered}
              onOpen={setDetailWP}
              onEdit={handleEdit}
              onComplete={(wp) => completeMut.mutate(wp.id)}
              isCompleting={completeMut.isPending}
            />
          )}

          {view === "hours" && (
            <HoursView
              rows={filtered}
              metrics={metrics}
              statusGroups={statusGroups}
              onOpen={setDetailWP}
            />
          )}

          {filtered.length === 0 && (
            <div className="fab-empty-shell">
              <EmptyState
                icon="wp"
                title={metrics.totalCount === 0 ? "No fab packages tracked" : "No packages match this view"}
                body={
                  metrics.totalCount === 0
                    ? "Create a fabrication work package and link drawings so release readiness can be tracked."
                    : "Clear filters or adjust the search to bring packages back into view."
                }
                cta={metrics.totalCount === 0 && can("create", "work_package") ? <Button variant="primary" icon="plus" onClick={handleOpenCreate}>New Package</Button> : null}
              />
            </div>
          )}
        </main>
      </section>

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
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Fab Package"
        description={`Delete "${getWorkPackageDisplayName(deleteTarget || {})}"? This action cannot be undone.`}
      />
    </div>
  );
}

function Hero({ projectName, metrics, view, onViewChange, onExport, onCreate }) {
  return (
    <section className="fab-hero">
      <div className="fab-hero-copy">
        <div className="fab-kicker">
          <Factory size={15} />
          Shop Release Control - {projectName}
        </div>
        <h1 style={display}>Fab Release</h1>
        <p>
          Track drawing readiness, release blockers, shop progress, labor burn, and ready-to-ship steel in one visual control board.
        </p>
        <div className="fab-hero-actions">
          <Button variant="secondary" icon="download" onClick={onExport}>CSV</Button>
          {onCreate && <Button variant="primary" icon="plus" onClick={onCreate}>New Package</Button>}
        </div>
      </div>
      <div className="fab-hero-grid">
        <HeroMetric
          label="Ready For Release"
          value={metrics.readyForRelease.length}
          sub={`${formatTons(metrics.readyForRelease.reduce((sum, wp) => sum + num(wp.tonnage), 0))} can move`}
          color="var(--status-success)"
          icon={CheckCircle2}
        />
        <HeroMetric
          label="In Shop"
          value={metrics.activeShop.length}
          sub={`${formatTons(metrics.releasedTons)} released`}
          color="var(--phase-fab)"
          icon={Hammer}
        />
        <HeroMetric
          label="Exceptions"
          value={metrics.exceptions.length}
          sub={`${metrics.drawingGaps.length} drawing gaps`}
          color={metrics.exceptions.length ? "var(--status-error)" : "var(--status-success)"}
          icon={AlertTriangle}
        />
        <HeroMetric
          label="Ready To Ship"
          value={metrics.readyToShip.length}
          sub={`${metrics.weightedProgress}% weighted progress`}
          color="var(--phase-delivery)"
          icon={Truck}
        />
      </div>
      <div className="fab-view-toggle fab-hero-view-toggle">
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              className={view === option.id ? "is-active" : ""}
              onClick={() => onViewChange(option.id)}
            >
              <Icon size={14} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function HeroMetric({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="fab-hero-metric" style={{ "--metric-color": color }}>
      <div className="fab-hero-icon">
        <Icon size={17} />
      </div>
      <div className="fab-metric-label">{label}</div>
      <div className="fab-metric-value" style={mono}>{value}</div>
      <div className="fab-metric-sub">{sub}</div>
    </div>
  );
}

function SummaryStrip({ metrics, stageFilter, onStageFilter }) {
  return (
    <section className="fab-summary-grid">
      <SummaryCard icon={PackageCheck} label="Total Tonnage" value={formatTons(metrics.totalTons)} sub={`${metrics.totalCount} packages`} color="var(--accent)" />
      <SummaryCard icon={Wrench} label="Shop Hours" value={`${metrics.laborBurn}%`} sub={`${formatHours(metrics.totalActualHours)} / ${formatHours(metrics.totalBudgetHours)}`} color={metrics.laborBurn > 100 ? "var(--status-error)" : "var(--status-info)"} />
      <SummaryCard icon={ShieldCheck} label="Release Blocked" value={metrics.releaseBlocked.length} sub={`${metrics.onHold.length} on hold`} color={metrics.releaseBlocked.length ? "var(--status-error)" : "var(--status-success)"} />
      <SummaryCard icon={Clock3} label="Released Tons" value={formatTons(metrics.releasedTons)} sub={`${metrics.activeShop.length} active shop packages`} color="var(--phase-fab)" />
      {metrics.stageRollup.slice(0, 4).map((stage) => (
        <button
          key={stage.id}
          type="button"
          className={`fab-stage-summary ${stageFilter === stage.id ? "is-active" : ""}`}
          style={{ "--stage-color": stage.color }}
          onClick={() => onStageFilter(stageFilter === stage.id ? "all" : stage.id)}
        >
          <span>{stage.short}</span>
          <strong>{stage.count}</strong>
          <ProgressBar value={stage.progress} color={stage.color} height={5} sub={`${formatTons(stage.cumulativeTons)} through`} />
        </button>
      ))}
    </section>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="fab-summary-card" style={{ "--summary-color": color }}>
      <div className="fab-summary-top">
        <span>{label}</span>
        <Icon size={15} />
      </div>
      <strong style={mono}>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function StageFlowStrip({ metrics, stageFilter, onStageFilter }) {
  return (
    <section className="fab-stage-strip">
      <div className="fab-section-head">
        <div>
          <div className="fab-section-label">Release Pipeline</div>
          <div className="fab-muted">Visual stage flow from approved drawings through ready-to-ship packages.</div>
        </div>
        <div className="fab-flow-total" style={mono}>{formatTons(metrics.totalTons)} total</div>
      </div>
      <div className="fab-stage-steps">
        {metrics.stageRollup.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`fab-stage-step ${stageFilter === stage.id ? "is-active" : ""}`}
            style={{ "--stage-color": stage.color }}
            onClick={() => onStageFilter(stageFilter === stage.id ? "all" : stage.id)}
          >
            <span>{stage.label}</span>
            <strong>{stage.count}</strong>
            <small>{formatTons(stage.tons)} here</small>
            <ProgressBar value={stage.progress} color={stage.color} height={4} />
          </button>
        ))}
      </div>
    </section>
  );
}

function Toolbar({
  search,
  onSearch,
  stageFilter,
  onStageFilter,
  riskFilter,
  onRiskFilter,
  view,
  onViewChange,
  filteredCount,
  totalCount,
  onClear,
}) {
  const activeFilters = [search.trim(), stageFilter !== "all", riskFilter !== "all"].filter(Boolean).length;
  return (
    <section className="fab-toolbar">
      <div className="fab-search">
        <Search size={15} />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search WP, drawing set, crew, status, flag..."
        />
      </div>
      <FilterSelect value={stageFilter} onChange={onStageFilter} options={STAGE_FILTERS} />
      <FilterSelect value={riskFilter} onChange={onRiskFilter} options={RISK_FILTERS} />
      <div className="fab-view-toggle">
        {VIEW_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              className={view === option.id ? "is-active" : ""}
              onClick={() => onViewChange(option.id)}
            >
              <Icon size={14} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      <div className="fab-toolbar-count" style={mono}>
        {filteredCount} of {totalCount}
      </div>
      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
      )}
    </section>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <label className="fab-filter-select">
      <Filter size={13} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExceptionRail({ metrics, onOpen, onFilterRisk, onFilterStage }) {
  const watchList = [
    ...metrics.exceptions,
    ...metrics.warnings.filter((wp) => !metrics.exceptions.some((item) => item.id === wp.id)),
  ].slice(0, 8);

  return (
    <aside className="fab-rail">
      <div className="fab-rail-header">
        <div>
          <div className="fab-section-label">Next Attention</div>
          <div className="fab-muted">Blocked release items and shop risks.</div>
        </div>
        <AlertTriangle size={18} color={metrics.exceptions.length ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <div className="fab-rail-kpis">
        <MiniStat label="Exceptions" value={metrics.exceptions.length} color="var(--status-error)" onClick={() => onFilterRisk("high")} />
        <MiniStat label="Warnings" value={metrics.warnings.length} color="var(--status-warning)" onClick={() => onFilterRisk("medium")} />
        <MiniStat label="Ready" value={metrics.readyForRelease.length} color="var(--status-success)" onClick={() => onFilterStage("material_on_hand")} />
        <MiniStat label="RTS" value={metrics.readyToShip.length} color="var(--phase-delivery)" onClick={() => onFilterStage("ready_to_ship")} />
      </div>

      <div className="fab-watch-list">
        {watchList.length ? watchList.map((wp) => (
          <button key={wp.id} type="button" className="fab-watch-card" onClick={() => onOpen(wp)}>
            <div className="fab-watch-top">
              <StatusPill label={wp._signals.risk === "high" ? "Exception" : "Warning"} color={riskColor(wp._signals.risk)} size="xs" />
              <span>{stageMeta(wp._signals.stage).short}</span>
            </div>
            <strong>{wp.wp_number || "WP"} - {getWorkPackageDisplayName(wp)}</strong>
            <small>{wp._signals.flags[0]?.label || "Review"} / {formatTons(wp.tonnage)}</small>
          </button>
        )) : (
          <div className="fab-rail-empty">No active fab release exceptions.</div>
        )}
      </div>
    </aside>
  );
}

function MiniStat({ label, value, color, onClick }) {
  return (
    <button type="button" className="fab-mini-stat" style={{ "--mini-color": color }} onClick={onClick}>
      <span>{label}</span>
      <strong style={mono}>{value}</strong>
    </button>
  );
}

function ViewHeader({ view, filteredCount, totalCount, onClear }) {
  const title = view === "flow"
    ? "Stage Flow"
    : view === "board"
      ? "Release Board"
      : view === "hours"
        ? "Shop Hours"
        : "Fab Register";
  const subtitle = view === "hours"
    ? "Budget and actual shop-hour visibility by package and status."
    : "Open each card for drawing packages, blockers, dates, labor, and status actions.";
  return (
    <div className="fab-view-header">
      <div>
        <div className="fab-section-label">{title}</div>
        <div className="fab-muted">{filteredCount} of {totalCount} packages shown. {subtitle}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>Clear Filters</Button>
    </div>
  );
}

function FlowView({ rows, stageRollup, onOpen, onEdit, onComplete, isCompleting }) {
  if (!rows.length) return null;
  return (
    <div className="fab-stage-lanes">
      {FAB_STAGES.map((stage) => {
        const items = rows.filter((wp) => wp._signals.stage === stage.id);
        const rollup = stageRollup.find((item) => item.id === stage.id);
        return (
          <section key={stage.id} className="fab-lane" style={{ "--lane-color": stage.color }}>
            <div className="fab-lane-head">
              <span>
                <strong>{stage.label}</strong>
                <small>{stage.description}</small>
              </span>
              <em>{items.length}</em>
            </div>
            <ProgressBar value={rollup?.progress || 0} color={stage.color} height={5} sub={`${formatTons(rollup?.tons || 0)} at stage`} />
            <div className="fab-card-list">
              {items.length ? items.map((wp) => (
                <FabPackageCard
                  key={wp.id}
                  wp={wp}
                  onOpen={() => onOpen(wp)}
                  onEdit={() => onEdit(wp)}
                  onComplete={() => onComplete(wp)}
                  isCompleting={isCompleting}
                />
              )) : (
                <div className="fab-lane-empty">No packages here</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardView({ laneGroups, onOpen, onEdit, onComplete, isCompleting }) {
  return (
    <div className="fab-board">
      {BOARD_LANES.map((lane) => {
        const items = laneGroups[lane] || [];
        const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
        return (
          <section key={lane} className="fab-board-lane" style={{ "--lane-color": BOARD_TONE[lane] }}>
            <div className="fab-board-head">
              <span>{lane}</span>
              <strong>{items.length} / {formatTons(tons)}</strong>
            </div>
            <div className="fab-card-list">
              {items.length ? items.map((wp) => (
                <FabPackageCard
                  key={wp.id}
                  wp={wp}
                  compact
                  onOpen={() => onOpen(wp)}
                  onEdit={() => onEdit(wp)}
                  onComplete={() => onComplete(wp)}
                  isCompleting={isCompleting}
                />
              )) : (
                <div className="fab-lane-empty">No packages</div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RegisterView({ rows, onOpen, onEdit, onComplete, isCompleting }) {
  if (!rows.length) return null;
  return (
    <section className="fab-register-shell">
      <table className="fab-register-table">
        <thead>
          <tr>
            <th>WP</th>
            <th>Package</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Drawings</th>
            <th>Progress</th>
            <th>Readiness</th>
            <th>Released</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((wp) => (
            <tr key={wp.id} onClick={() => onOpen(wp)} className={`risk-${wp._signals.risk}`}>
              <td><span className="fab-wp-number">{wp.wp_number || "-"}</span></td>
              <td>
                <strong>{getWorkPackageDisplayName(wp)}</strong>
                <small>{wp.crew || "No shop owner"} / {formatTons(wp.tonnage)}</small>
              </td>
              <td><StageBadge stage={wp._signals.stage} /></td>
              <td><StatusPill label={wp._signals.status} color={STATUS_TONE[wp._signals.status]} size="xs" /></td>
              <td>{wp._signals.drawing.releasedCount}/{wp._signals.drawing.linkedCount || 0}</td>
              <td><ProgressBar value={wp._signals.progress} color={stageColor(wp._signals.stage)} height={4} sub={`${wp._signals.progress}%`} /></td>
              <td><Readiness value={wp._signals.readinessScore} risk={wp._signals.risk} /></td>
              <td>{formatDate(wp.released_date)}</td>
              <td>
                <CardActions
                  wp={wp}
                  onEdit={(event) => { event.stopPropagation(); onEdit(wp); }}
                  onComplete={(event) => { event.stopPropagation(); onComplete(wp); }}
                  isCompleting={isCompleting}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function HoursView({ rows, metrics, statusGroups, onOpen }) {
  if (!rows.length) return null;
  return (
    <div className="fab-hours-view">
      <section className="fab-hours-summary">
        <SummaryCard icon={Gauge} label="Shop Burn" value={`${metrics.laborBurn}%`} sub={`${formatHours(metrics.totalActualHours)} actual`} color={metrics.laborBurn > 100 ? "var(--status-error)" : "var(--status-info)"} />
        <SummaryCard icon={Clock3} label="Budget Hours" value={formatHours(metrics.totalBudgetHours)} sub="Total planned shop hours" color="var(--accent)" />
        <SummaryCard icon={Wrench} label="Actual Hours" value={formatHours(metrics.totalActualHours)} sub="Posted shop hours" color="var(--phase-fab)" />
        <SummaryCard icon={AlertTriangle} label="Over Budget" value={rows.filter((wp) => wp._signals.hourBurn > 100).length} sub="Packages over shop budget" color="var(--status-error)" />
      </section>

      <section className="fab-status-hours">
        {STATUS_ORDER.map((status) => {
          const items = statusGroups[status] || [];
          const budget = items.reduce((sum, wp) => sum + wp._signals.totalBudgetHours, 0);
          const actual = items.reduce((sum, wp) => sum + wp._signals.totalActualHours, 0);
          const burn = budget > 0 ? Math.round((actual / budget) * 100) : 0;
          return (
            <div key={status} className="fab-hour-bucket" style={{ "--bucket-color": STATUS_TONE[status] }}>
              <div className="fab-hour-bucket-head">
                <span>{status}</span>
                <strong>{items.length}</strong>
              </div>
              <ProgressBar value={burn} color={STATUS_TONE[status]} height={5} sub={`${formatHours(actual)} / ${formatHours(budget)}`} />
            </div>
          );
        })}
      </section>

      <section className="fab-hours-table">
        {rows.map((wp) => (
          <button key={wp.id} type="button" className="fab-hour-row" onClick={() => onOpen(wp)}>
            <span>
              <strong>{wp.wp_number || "WP"} - {getWorkPackageDisplayName(wp)}</strong>
              <small>{stageMeta(wp._signals.stage).label} / {wp.crew || "No shop owner"}</small>
            </span>
            <span>{formatHours(wp._signals.totalActualHours)} actual</span>
            <span>{formatHours(wp._signals.totalBudgetHours)} budget</span>
            <Readiness value={wp._signals.hourBurn || 0} risk={wp._signals.hourBurn > 100 ? "high" : "clear"} suffix="% burn" />
          </button>
        ))}
      </section>
    </div>
  );
}

function FabPackageCard({ wp, compact = false, onOpen, onEdit, onComplete, isCompleting }) {
  const signals = wp._signals;
  const firstFlag = signals.flags[0];
  return (
    <article className={`fab-package-card risk-${signals.risk} ${compact ? "is-compact" : ""}`} onClick={onOpen}>
      <div className="fab-card-top">
        <span className="fab-wp-number">{wp.wp_number || "WP"}</span>
        <StageBadge stage={signals.stage} />
      </div>
      <h3>{getWorkPackageDisplayName(wp)}</h3>
      {!compact && (
        <div className="fab-card-facts">
          <Fact icon={PackageCheck} label="Tons" value={formatTons(wp.tonnage)} />
          <Fact icon={Users} label="Owner" value={wp.crew || "Open"} />
          <Fact icon={CalendarDays} label="Release" value={formatDate(wp.released_date)} />
        </div>
      )}
      <ProgressBar value={signals.progress} color={stageColor(signals.stage)} height={5} sub={`${signals.progress}% complete`} />
      <div className="fab-card-pills">
        <Readiness value={signals.readinessScore} risk={signals.risk} />
        <Flag label={firstFlag?.label || "No blockers"} severity={firstFlag?.severity || "clear"} />
      </div>
      <div className="fab-card-drawings">
        {signals.drawing.releasedCount}/{signals.drawing.linkedCount || 0} released drawings
        {signals.drawing.packageNames[0] ? ` / ${signals.drawing.packageNames[0]}` : ""}
      </div>
      <div className="fab-card-actions">
        <CardActions wp={wp} onEdit={onEdit} onComplete={onComplete} isCompleting={isCompleting} />
      </div>
    </article>
  );
}

function CardActions({ wp, onEdit, onComplete, isCompleting }) {
  return (
    <span className="fab-row-actions">
      <button type="button" onClick={onEdit} title="Edit package" aria-label="Edit package">
        <Pencil size={12} />
      </button>
      {wp._signals.stage !== "ready_to_ship" && (
        <button type="button" onClick={onComplete} disabled={isCompleting} title="Mark ready to ship" aria-label="Mark ready to ship">
          <Check size={12} />
        </button>
      )}
    </span>
  );
}

function StageBadge({ stage }) {
  const meta = stageMeta(stage);
  return (
    <span className="fab-stage-badge" style={{ "--badge-color": meta.color }}>
      {meta.short}
    </span>
  );
}

function Readiness({ value, risk, suffix = "% ready" }) {
  const tone = riskColor(risk || (value >= 80 ? "clear" : value >= 55 ? "medium" : "high"));
  return <span className="fab-readiness" style={{ "--readiness-color": tone }}>{value}{suffix}</span>;
}

function Flag({ label, severity }) {
  return <span className="fab-flag" style={{ "--flag-color": riskColor(severity) }}>{label}</span>;
}

function Fact({ icon: Icon, label, value }) {
  return (
    <span className="fab-fact">
      <Icon size={12} />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </span>
  );
}

function DetailPanel({ wp, onClose, onEdit, onDelete, onComplete, isCompleting }) {
  const signals = wp._signals;
  const packageLabels = signals.drawing.packages.map(drawingPackageLabel);
  return (
    <div className="fab-detail-backdrop" role="presentation" onClick={onClose}>
      <aside className="fab-detail-panel" role="dialog" aria-modal="true" aria-label="Fab package details" onClick={(event) => event.stopPropagation()}>
        <div className="fab-detail-head">
          <div>
            <div className="fab-kicker">
              <Factory size={14} />
              {wp.wp_number || "WP"} / {stageMeta(signals.stage).label}
            </div>
            <h2 style={display}>{getWorkPackageDisplayName(wp)}</h2>
          </div>
          <button type="button" className="fab-close" onClick={onClose} aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        <div className="fab-detail-pills">
          <StageBadge stage={signals.stage} />
          <StatusPill label={signals.status} color={STATUS_TONE[signals.status]} />
          <StatusPill label={signals.risk === "high" ? "Exception" : signals.risk === "medium" ? "Warning" : "Clear"} color={riskColor(signals.risk)} />
          <Readiness value={signals.readinessScore} risk={signals.risk} />
        </div>

        <section className="fab-detail-section">
          <div className="fab-section-label">Release Status</div>
          <div className="fab-detail-grid">
            <DetailStat label="Tonnage" value={formatTons(wp.tonnage)} />
            <DetailStat label="Progress" value={`${signals.progress}%`} />
            <DetailStat label="Released" value={formatDate(wp.released_date)} />
            <DetailStat label="Crew / Owner" value={wp.crew || "Open"} />
            <DetailStat label="VIF" value={wp.vif_confirmed ? "Confirmed" : "Open"} />
            <DetailStat label="Load List" value={wp.load_list_complete ? "Complete" : "Open"} />
          </div>
        </section>

        <section className="fab-detail-section">
          <div className="fab-section-label">Drawing Packages</div>
          {packageLabels.length ? (
            <div className="fab-detail-list">
              {packageLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          ) : (
            <div className="fab-detail-empty">No linked drawing packages.</div>
          )}
          <div className="fab-muted">
            {signals.drawing.releasedCount}/{signals.drawing.linkedCount || 0} linked drawings released for fabrication.
          </div>
        </section>

        <section className="fab-detail-section">
          <div className="fab-section-label">Blockers</div>
          {signals.flags.length ? (
            <div className="fab-detail-flags">
              {signals.flags.map((flag) => (
                <Flag key={flag.key} label={flag.label} severity={flag.severity} />
              ))}
            </div>
          ) : (
            <div className="fab-detail-empty">No blockers currently flagged.</div>
          )}
        </section>

        <section className="fab-detail-section">
          <div className="fab-section-label">Shop Hours</div>
          <ProgressBar
            value={signals.hourBurn}
            color={signals.hourBurn > 100 ? "var(--status-error)" : "var(--phase-fab)"}
            height={7}
            sub={`${formatHours(signals.totalActualHours)} actual / ${formatHours(signals.totalBudgetHours)} budget`}
          />
        </section>

        <div className="fab-detail-actions">
          {onEdit && <Button variant="secondary" icon="edit" onClick={onEdit}>Edit</Button>}
          {signals.stage !== "ready_to_ship" && (
            <Button variant="primary" icon="check" onClick={onComplete} disabled={isCompleting}>Mark RTS</Button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              style={{
                background: "var(--danger-muted)", border: "1px solid var(--danger-border)",
                color: "var(--status-error)", borderRadius: "var(--radius-btn)",
                padding: "6px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <Trash2 size={13} /> Delete
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className="fab-detail-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const FAB_RELEASE_STYLES = `
.fab-release-page {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.fab-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: 18px;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--border-default) 86%, white 14%);
  border-radius: 16px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--bg-surface-high) 88%, #0ea5e9 12%), color-mix(in srgb, var(--bg-surface) 90%, #0f766e 10%)),
    linear-gradient(90deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent 64%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 42px rgba(0,0,0,0.30);
}

.fab-hero-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.fab-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
}

.fab-hero h1 {
  margin: 8px 0 0;
  font-size: clamp(30px, 4.2vw, 52px);
  line-height: 0.96;
  color: var(--text-primary);
}

.fab-hero p {
  max-width: 720px;
  margin: 13px 0 0;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: 13px;
  line-height: 1.55;
}

.fab-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.fab-hero-grid,
.fab-summary-grid,
.fab-hours-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.fab-hero-metric,
.fab-summary-card,
.fab-stage-summary {
  min-height: 118px;
  border: 1px solid color-mix(in srgb, var(--metric-color, var(--summary-color, var(--stage-color, var(--accent)))) 28%, var(--border-default));
  border-radius: 14px;
  padding: 13px;
  background: linear-gradient(145deg, color-mix(in srgb, var(--metric-color, var(--summary-color, var(--stage-color, var(--accent)))) 9%, var(--bg-surface-high)), var(--bg-surface-low));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.22);
  text-align: left;
}

.fab-hero-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--metric-color) 14%, transparent);
  color: var(--metric-color);
  border: 1px solid color-mix(in srgb, var(--metric-color) 34%, transparent);
}

.fab-metric-label,
.fab-summary-top span,
.fab-stage-summary span,
.fab-section-label,
.fab-metric-sub,
.fab-flow-total,
.fab-toolbar-count {
  font-family: var(--font-mono);
  text-transform: uppercase;
}

.fab-metric-label,
.fab-summary-top span,
.fab-section-label,
.fab-stage-summary span {
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.13em;
  color: var(--text-muted);
}

.fab-metric-value {
  display: block;
  margin-top: 12px;
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
  color: var(--metric-color);
}

.fab-metric-sub,
.fab-summary-card small,
.fab-stage-summary small,
.fab-muted,
.fab-card-drawings,
.fab-lane-head small,
.fab-hour-row small {
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
}

.fab-hero-view-toggle {
  position: absolute;
  right: 18px;
  top: 18px;
}

.fab-summary-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.fab-summary-card,
.fab-stage-summary {
  --metric-color: var(--summary-color, var(--stage-color));
  min-height: 112px;
}

.fab-summary-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--summary-color);
}

.fab-summary-card strong,
.fab-stage-summary strong {
  display: block;
  margin-top: 11px;
  font-size: 24px;
  line-height: 1;
  color: var(--summary-color, var(--stage-color));
}

.fab-stage-summary {
  cursor: pointer;
  border-color: var(--border-default);
}

.fab-stage-summary.is-active {
  border-color: var(--stage-color);
}

.fab-stage-strip,
.fab-toolbar,
.fab-rail,
.fab-register-shell,
.fab-hours-table,
.fab-status-hours {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface);
}

.fab-stage-strip {
  padding: 14px;
}

.fab-section-head,
.fab-rail-header,
.fab-view-header,
.fab-card-top,
.fab-board-head,
.fab-lane-head,
.fab-hour-bucket-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.fab-stage-steps {
  display: grid;
  grid-template-columns: repeat(7, minmax(145px, 1fr));
  gap: 8px;
  margin-top: 12px;
  overflow-x: auto;
}

.fab-stage-step {
  min-height: 106px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.fab-stage-step.is-active {
  border-color: var(--stage-color);
  background: color-mix(in srgb, var(--stage-color) 12%, var(--bg-surface-low));
}

.fab-stage-step span,
.fab-stage-step small {
  display: block;
}

.fab-stage-step span {
  min-height: 28px;
  font-family: var(--font-display);
  font-size: 12px;
  font-weight: 800;
  color: var(--text-primary);
}

.fab-stage-step strong {
  display: block;
  margin: 8px 0 2px;
  color: var(--stage-color);
  font-family: var(--font-mono);
  font-size: 21px;
}

.fab-toolbar {
  min-height: 54px;
  padding: 10px;
  display: flex;
  gap: 9px;
  align-items: center;
  flex-wrap: wrap;
}

.fab-search {
  min-width: 260px;
  flex: 1 1 310px;
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-muted);
}

.fab-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 12px;
}

.fab-filter-select {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface-low);
  color: var(--text-muted);
}

.fab-filter-select select {
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  text-transform: uppercase;
}

.fab-view-toggle {
  display: inline-flex;
  gap: 5px;
  padding: 5px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface-low);
}

.fab-view-toggle button {
  height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 0 10px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}

.fab-view-toggle button.is-active {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-muted);
}

.fab-toolbar-count {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.fab-release-layout {
  display: grid;
  grid-template-columns: 302px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.fab-rail {
  position: sticky;
  top: 12px;
  padding: 14px;
}

.fab-rail-kpis {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 13px;
}

.fab-mini-stat {
  min-height: 70px;
  border: 1px solid color-mix(in srgb, var(--mini-color) 30%, var(--border-default));
  border-radius: 12px;
  background: color-mix(in srgb, var(--mini-color) 8%, var(--bg-surface-low));
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  padding: 10px;
}

.fab-mini-stat span {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fab-mini-stat strong {
  display: block;
  margin-top: 8px;
  color: var(--mini-color);
  font-size: 22px;
}

.fab-watch-list {
  display: grid;
  gap: 8px;
  margin-top: 14px;
}

.fab-watch-card {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.fab-watch-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.fab-watch-top span:last-child,
.fab-watch-card small {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
}

.fab-watch-card strong {
  display: block;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-primary);
}

.fab-watch-card small {
  display: block;
  margin-top: 5px;
}

.fab-rail-empty,
.fab-lane-empty,
.fab-detail-empty {
  padding: 16px;
  border: 1px dashed var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface-low);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: center;
}

.fab-release-main {
  min-width: 0;
  display: grid;
  gap: 12px;
}

.fab-view-header {
  padding: 4px 2px;
}

.fab-stage-lanes,
.fab-board {
  display: grid;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.fab-stage-lanes {
  grid-template-columns: repeat(7, minmax(232px, 1fr));
}

.fab-board {
  grid-template-columns: repeat(5, minmax(240px, 1fr));
}

.fab-lane,
.fab-board-lane {
  min-height: 420px;
  border: 1px solid color-mix(in srgb, var(--lane-color) 24%, var(--border-default));
  border-top: 4px solid var(--lane-color);
  border-radius: 14px;
  padding: 11px;
  background: var(--bg-surface);
}

.fab-lane-head strong,
.fab-board-head span {
  display: block;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 900;
}

.fab-lane-head em,
.fab-board-head strong {
  min-width: 30px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  color: var(--lane-color);
  background: color-mix(in srgb, var(--lane-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--lane-color) 35%, transparent);
  font-family: var(--font-mono);
  font-style: normal;
  font-size: 10px;
  font-weight: 900;
}

.fab-card-list {
  display: grid;
  gap: 9px;
  margin-top: 11px;
}

.fab-package-card {
  border: 1px solid var(--border-default);
  border-left: 4px solid var(--status-success);
  border-radius: 12px;
  background: var(--bg-surface-low);
  padding: 11px;
  cursor: pointer;
  box-shadow: 0 10px 22px rgba(0,0,0,0.20);
}

.fab-package-card:hover,
.fab-watch-card:hover,
.fab-hour-row:hover {
  border-color: var(--accent-border);
  background: var(--bg-surface-high);
}

.fab-package-card.risk-high {
  border-left-color: var(--status-error);
}

.fab-package-card.risk-medium {
  border-left-color: var(--status-warning);
}

.fab-package-card h3 {
  margin: 9px 0 10px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 13px;
  line-height: 1.25;
}

.fab-card-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-bottom: 10px;
}

.fab-fact {
  display: flex;
  gap: 6px;
  min-width: 0;
  align-items: center;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 7px;
  background: var(--bg-surface);
  color: var(--text-muted);
}

.fab-fact span {
  min-width: 0;
}

.fab-fact small {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.fab-fact strong {
  display: block;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fab-wp-number {
  color: var(--accent);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.fab-stage-badge,
.fab-readiness,
.fab-flag {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border-radius: var(--radius-badge);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  line-height: 1;
}

.fab-stage-badge {
  padding: 3px 7px;
  color: var(--badge-color);
  border: 1px solid color-mix(in srgb, var(--badge-color) 36%, transparent);
  background: color-mix(in srgb, var(--badge-color) 13%, transparent);
}

.fab-readiness {
  padding: 4px 7px;
  color: var(--readiness-color);
  background: color-mix(in srgb, var(--readiness-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--readiness-color) 34%, transparent);
}

.fab-flag {
  padding: 4px 7px;
  color: var(--flag-color);
  background: color-mix(in srgb, var(--flag-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--flag-color) 30%, transparent);
}

.fab-card-pills,
.fab-detail-pills,
.fab-detail-flags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 9px;
}

.fab-card-drawings {
  margin-top: 9px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fab-card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.fab-row-actions {
  display: inline-flex;
  gap: 5px;
}

.fab-row-actions button,
.fab-close {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  cursor: pointer;
}

.fab-row-actions button:hover,
.fab-close:hover {
  color: var(--accent);
  border-color: var(--accent-border);
}

.fab-row-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.fab-register-shell {
  overflow-x: auto;
}

.fab-register-table {
  width: 100%;
  min-width: 1000px;
  border-collapse: collapse;
}

.fab-register-table th,
.fab-register-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--divider);
  text-align: left;
  vertical-align: middle;
}

.fab-register-table th {
  color: var(--text-muted);
  background: var(--bg-surface-secondary);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.fab-register-table tr {
  cursor: pointer;
}

.fab-register-table tr:hover {
  background: var(--hover-bg);
}

.fab-register-table td {
  color: var(--text-secondary);
  font-size: 11px;
}

.fab-register-table td strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
}

.fab-register-table td small {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
}

.fab-hours-view {
  display: grid;
  gap: 12px;
}

.fab-status-hours {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}

.fab-hour-bucket {
  border: 1px solid color-mix(in srgb, var(--bucket-color) 26%, var(--border-default));
  border-radius: 12px;
  padding: 11px;
  background: color-mix(in srgb, var(--bucket-color) 7%, var(--bg-surface-low));
}

.fab-hour-bucket-head span,
.fab-hour-bucket-head strong {
  color: var(--bucket-color);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.fab-hours-table {
  display: grid;
  overflow: hidden;
}

.fab-hour-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 120px 120px 110px;
  gap: 12px;
  align-items: center;
  min-height: 62px;
  border: 0;
  border-bottom: 1px solid var(--divider);
  background: transparent;
  color: var(--text-secondary);
  padding: 10px 13px;
  text-align: left;
  cursor: pointer;
}

.fab-hour-row strong {
  display: block;
  color: var(--text-primary);
  font-size: 12px;
}

.fab-hour-row > span:not(:first-child) {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 900;
  color: var(--text-secondary);
}

.fab-empty-shell {
  padding: 14px 0;
}

.fab-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0,0,0,0.56);
  display: flex;
  justify-content: flex-end;
}

.fab-detail-panel {
  width: min(520px, 100vw);
  height: 100vh;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-surface);
  border-left: 1px solid var(--border-default);
  box-shadow: -24px 0 60px rgba(0,0,0,0.42);
}

.fab-detail-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: flex-start;
}

.fab-detail-head h2 {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 26px;
  line-height: 1.08;
}

.fab-detail-section {
  margin-top: 18px;
  padding-top: 15px;
  border-top: 1px solid var(--divider);
}

.fab-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 10px;
}

.fab-detail-stat {
  min-height: 68px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  padding: 10px;
  background: var(--bg-surface-low);
}

.fab-detail-stat span {
  display: block;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.fab-detail-stat strong {
  display: block;
  margin-top: 8px;
  color: var(--text-primary);
  font-size: 13px;
}

.fab-detail-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}

.fab-detail-list span {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  padding: 8px 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  font-size: 12px;
}

.fab-detail-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 22px;
  padding-top: 14px;
  background: var(--bg-surface);
  border-top: 1px solid var(--divider);
}

@media (max-width: 1200px) {
  .fab-release-layout {
    grid-template-columns: 1fr;
  }

  .fab-rail {
    position: static;
  }
}

@media (max-width: 920px) {
  .fab-hero {
    grid-template-columns: 1fr;
  }

  .fab-hero-view-toggle {
    position: static;
    margin-top: 14px;
    width: max-content;
  }

  .fab-status-hours,
  .fab-hero-grid,
  .fab-hours-summary {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .fab-release-page {
    padding: 12px;
  }

  .fab-hero,
  .fab-stage-strip,
  .fab-toolbar,
  .fab-rail {
    border-radius: 12px;
  }

  .fab-hero {
    padding: 15px;
  }

  .fab-hero h1 {
    font-size: 34px;
  }

  .fab-view-toggle,
  .fab-search,
  .fab-filter-select {
    width: 100%;
  }

  .fab-view-toggle {
    overflow-x: auto;
  }

  .fab-toolbar-count {
    margin-left: 0;
  }

  .fab-card-facts,
  .fab-detail-grid,
  .fab-rail-kpis {
    grid-template-columns: 1fr;
  }

  .fab-hour-row {
    grid-template-columns: 1fr;
  }

  .fab-stage-lanes,
  .fab-board {
    grid-template-columns: repeat(7, minmax(230px, 82vw));
  }
}
`;
