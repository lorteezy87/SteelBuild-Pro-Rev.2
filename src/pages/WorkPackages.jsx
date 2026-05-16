/**
 * WorkPackages - production control surface for fabrication, delivery,
 * and erection packages.
 *
 * This page owns data access and mutations. Presentation is organized
 * around real execution questions: what is ready, what is blocked, what
 * is slipping, and what needs a human update next.
 */

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Columns3,
  Gauge,
  Hammer,
  LayoutGrid,
  List,
  MapPinned,
  Package,
  Pencil,
  Search,
  ShieldCheck,
  ShipWheel,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import DeleteDialog from "@/components/shared/DeleteDialog";
import WorkPackageDetailModal from "@/components/workpackages/WorkPackageDetailModal";
import WPFormModal from "@/components/workpackages/WPFormModal";
import WPBulkAddModal from "@/components/workpackages/WPBulkAddModal";
import { getNextNumber } from "@/components/shared/numberSequencing";
import { batchProcess } from "@/utils/batchProcess";
import { BulkActionBar, Button, EmptyState, ProgressBar, StatusPill } from "@/components/design-system";
import { formatDateShort } from "@/components/shared/formatters";
import { exportWorkPackagesCSV } from "./workPackages/utils";
import {
  PHASE_ORDER,
  buildWorkPackageMetrics,
  sortWorkPackagesForExecution,
} from "./workPackages/analytics";

const PHASE_META = {
  Detailing: {
    label: "Detailing",
    short: "Detail",
    color: "var(--phase-detailing)",
    icon: ShieldCheck,
    description: "Drawings, VIF, and release readiness.",
  },
  Fabrication: {
    label: "Fabrication",
    short: "Fab",
    color: "var(--phase-fab)",
    icon: Hammer,
    description: "Shop work, labor burn, and load prep.",
  },
  Delivery: {
    label: "Delivery",
    short: "Ship",
    color: "var(--phase-delivery)",
    icon: Truck,
    description: "Loads, delivery readiness, and shipped material.",
  },
  Erection: {
    label: "Erection",
    short: "Erect",
    color: "var(--phase-erection)",
    icon: MapPinned,
    description: "Field install sequence, crew, and closeout.",
  },
};

const STATUS_OPTIONS = ["Not Started", "In Progress", "Complete", "On Hold"];
const STATUS_TONE = {
  "Not Started": "var(--text-muted)",
  "In Progress": "var(--status-warning)",
  Complete: "var(--status-success)",
  "On Hold": "var(--status-error)",
};

const VIEW_OPTIONS = [
  { id: "flow", label: "Flow", icon: Columns3 },
  { id: "board", label: "Board", icon: LayoutGrid },
  { id: "register", label: "Register", icon: List },
];

const RISK_FILTERS = [
  { id: "all", label: "All" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];

const mono = { fontFamily: "var(--font-mono)" };
const display = { fontFamily: "'Space Grotesk', var(--font-display)" };

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

function phaseColor(phase) {
  return PHASE_META[phase]?.color || "var(--accent)";
}

export default function WorkPackages() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [view, setView] = useState("flow");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingWP, setEditingWP] = useState(null);
  const [wpModalOpen, setWPModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailWP, setDetailWP] = useState(null);
  const [selectedWPs, setSelectedWPs] = useState(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

  const { data: rawWorkPackages = [], isLoading: wpLoading } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: async () => {
      if (projectId) return base44.entities.WorkPackage.filter({ project_id: projectId });
      const all = await base44.entities.WorkPackage.list();
      return all.sort((a, b) => (a.project_name || "").localeCompare(b.project_name || ""));
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
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
      if (projectId) return base44.entities.Drawing.filter({ project_id: projectId });
      return base44.entities.Drawing.list();
    },
    staleTime: 30 * 1000,
  });

  const { data: projectDeliveries = [] } = useQuery({
    queryKey: ["deliveries-for-wps", projectId],
    queryFn: () => projectId
      ? base44.entities.Delivery.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });

  const invalidateWps = () => {
    qc.invalidateQueries({ queryKey: ["work-packages"] });
    qc.invalidateQueries({ queryKey: ["wps-all"] });
  };

  const updateWPMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WorkPackage.update(id, data),
    onSuccess: () => {
      invalidateWps();
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const createWPMut = useMutation({
    mutationFn: (data) => base44.entities.WorkPackage.create(data),
    onSuccess: () => {
      invalidateWps();
      setWPModalOpen(false);
      setEditingWP(null);
      toast.success("Work package created");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.WorkPackage.delete(id),
    onSuccess: () => {
      invalidateWps();
      setDeleteTarget(null);
      toast.success("Work package deleted");
    },
    onError: (err) => {
      console.error("WP delete failed", err);
      toast.error(`Delete failed: ${err?.message || "unknown error"}`);
    },
  });

  const bulkCreateMut = useMutation({
    mutationFn: async (rows) => {
      if (!rows?.length) throw new Error("No rows to add");
      if (!effectiveProjectId) throw new Error("Select a project first");
      const needsNumbers = rows.filter((row) => !row.wp_number);
      let nextStart = null;
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
      return batchProcess(prepared, (data) => base44.entities.WorkPackage.create(data), 5);
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
      invalidateWps();
      setSelectedWPs(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Status updated");
      }
    },
    onError: () => toast.error("Bulk update failed"),
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
  }, [metrics.enriched, phaseFilter, statusFilter, riskFilter, search]);

  const selectedRows = useMemo(
    () => filtered.filter((wp) => selectedWPs.has(wp.id)),
    [filtered, selectedWPs]
  );

  const projectName = selectedProject?.name || (projectId ? "No active project" : "All Projects");

  const toggleSelect = (id) =>
    setSelectedWPs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleWPEdit = (wp) => {
    setEditingWP(wp);
    setWPModalOpen(true);
  };

  const handleWPCreate = React.useCallback(async () => {
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
    setEditingWP({ wp_number: wpNumber, project_id: effectiveProjectId });
    setWPModalOpen(true);
  }, [effectiveProjectId, workPackages]);

  useAutoOpenCreate(handleWPCreate, { enabled: !!effectiveProjectId });

  if (wpLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <style>{RESPONSIVE_CSS}</style>
      <Hero
        projectName={projectName}
        metrics={metrics}
        view={view}
        onViewChange={setView}
        onExport={() => exportWorkPackagesCSV(filtered)}
        onBulkAdd={() => setBulkAddOpen(true)}
        onCreate={handleWPCreate}
        canCreate={!!effectiveProjectId}
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
        }}
      />

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
              onEdit={handleWPEdit}
              onDelete={setDeleteTarget}
              selectedWPs={selectedWPs}
              onToggleSelect={toggleSelect}
            />
          )}

          {view === "board" && (
            <StatusBoardView
              rows={filtered}
              onOpen={setDetailWP}
              onEdit={handleWPEdit}
              onDelete={setDeleteTarget}
            />
          )}

          {view === "register" && (
            <RegisterView
              rows={filtered}
              selectedWPs={selectedWPs}
              onToggleSelect={toggleSelect}
              onOpen={setDetailWP}
              onEdit={handleWPEdit}
              onDelete={setDeleteTarget}
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
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Work Package"
        description={`Delete "${deleteTarget?.name}" (${deleteTarget?.wp_number})? This cannot be undone.`}
      />
    </div>
  );
}

function Hero({ projectName, metrics, view, onViewChange, onExport, onBulkAdd, onCreate, canCreate }) {
  return (
    <section className="wp-hero" style={heroStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={eyebrowStyle}>Work Package Control</div>
        <div style={heroTitleStyle}>Production Flow</div>
        <div style={heroMetaStyle}>
          <span>{projectName}</span>
          <span>{metrics.totalCount} packages</span>
          <span>{formatTons(metrics.totalTons)}</span>
          <span>{metrics.progress}% weighted progress</span>
        </div>
      </div>

      <div style={heroActionStyle}>
        <div style={viewToggleStyle}>
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = view === option.id;
            return (
              <button key={option.id} type="button" onClick={() => onViewChange(option.id)} style={viewButtonStyle(active)}>
                <Icon size={13} />
                {option.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button variant="secondary" icon="download" onClick={onExport}>CSV</Button>
          <Button variant="outline" icon="upload" onClick={onBulkAdd} disabled={!canCreate}>Bulk Add</Button>
          <Button variant="primary" icon="plus" onClick={onCreate} disabled={!canCreate}>New WP</Button>
        </div>
      </div>
    </section>
  );
}

function SummaryStrip({ metrics, phaseFilter, onPhaseFilter }) {
  return (
    <section style={summaryGridStyle}>
      <MetricCard icon={Package} label="Total Tons" value={formatTons(metrics.totalTons)} sub={`${metrics.totalCount} packages`} tone="var(--accent)" />
      <MetricCard icon={Gauge} label="Labor Burn" value={`${metrics.laborBurn}%`} sub={`${formatHours(metrics.totalActualHours)} / ${formatHours(metrics.totalBudgetHours)}`} tone={metrics.laborBurn > 100 ? "var(--status-error)" : "var(--status-info)"} />
      <MetricCard icon={AlertTriangle} label="Exceptions" value={metrics.highRisk.length} sub={`${metrics.mediumRisk.length} warnings`} tone={metrics.highRisk.length ? "var(--status-error)" : "var(--status-success)"} />
      <MetricCard icon={ShipWheel} label="Ready To Ship" value={metrics.readyForShip.length} sub={`${metrics.fieldReady.length} field ready`} tone="var(--phase-delivery)" />
      {metrics.phaseRollup.map((row) => (
        <button key={row.phase} type="button" onClick={() => onPhaseFilter(phaseFilter === row.phase ? "all" : row.phase)} style={phaseMetricStyle(row.phase, phaseFilter === row.phase)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={metricLabelStyle}>{PHASE_META[row.phase].short}</span>
            <span style={{ color: phaseColor(row.phase), ...mono, fontSize: 10, fontWeight: 800 }}>{row.count}</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <ProgressBar value={row.progress} color={phaseColor(row.phase)} height={5} sub={`${formatTons(row.tons)} - ${row.progress}%`} />
          </div>
        </button>
      ))}
    </section>
  );
}

function ControlPanel({
  search,
  onSearch,
  phaseFilter,
  onPhaseFilter,
  statusFilter,
  onStatusFilter,
  riskFilter,
  onRiskFilter,
  filteredCount,
  totalCount,
  onClear,
}) {
  const activeCount = [search, phaseFilter !== "all", statusFilter !== "all", riskFilter !== "all"].filter(Boolean).length;
  return (
    <section style={controlPanelStyle}>
      <div style={searchBoxStyle}>
        <Search size={14} color="var(--text-muted)" />
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search WP #, package, crew, status, notes..."
          style={searchInputStyle}
        />
      </div>

      <FilterGroup label="Phase">
        <FilterButton active={phaseFilter === "all"} onClick={() => onPhaseFilter("all")}>All</FilterButton>
        {PHASE_ORDER.map((phase) => (
          <FilterButton key={phase} active={phaseFilter === phase} tone={phaseColor(phase)} onClick={() => onPhaseFilter(phase)}>
            {PHASE_META[phase].short}
          </FilterButton>
        ))}
      </FilterGroup>

      <FilterGroup label="Status">
        <FilterButton active={statusFilter === "all"} onClick={() => onStatusFilter("all")}>All</FilterButton>
        {STATUS_OPTIONS.map((status) => (
          <FilterButton key={status} active={statusFilter === status} tone={STATUS_TONE[status]} onClick={() => onStatusFilter(status)}>
            {status}
          </FilterButton>
        ))}
      </FilterGroup>

      <FilterGroup label="Risk">
        {RISK_FILTERS.map((risk) => (
          <FilterButton
            key={risk.id}
            active={riskFilter === risk.id}
            tone={risk.id === "high" ? "var(--status-error)" : risk.id === "medium" ? "var(--status-warning)" : risk.id === "clear" ? "var(--status-success)" : "var(--accent)"}
            onClick={() => onRiskFilter(risk.id)}
          >
            {risk.label}
          </FilterButton>
        ))}
      </FilterGroup>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={countLabelStyle}>{filteredCount} of {totalCount}</span>
        {activeCount > 0 && (
          <button type="button" onClick={onClear} style={clearButtonStyle}>Clear</button>
        )}
      </div>
    </section>
  );
}

function ExceptionPanel({ metrics, onRiskFilter, onStatusFilter, onPhaseFilter, onOpen }) {
  const watchList = [
    ...metrics.highRisk,
    ...metrics.mediumRisk.filter((wp) => !metrics.highRisk.some((h) => h.id === wp.id)),
  ].slice(0, 6);

  return (
    <aside style={sideRailStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <div style={eyebrowStyle}>Next Attention</div>
          <div style={panelTitleStyle}>Exceptions</div>
        </div>
        <AlertTriangle size={18} color={metrics.highRisk.length ? "var(--status-error)" : "var(--status-success)"} />
      </div>

      <button type="button" onClick={() => onRiskFilter("high")} style={railStatStyle("var(--status-error)")}>
        <span>High risk</span>
        <strong>{metrics.highRisk.length}</strong>
      </button>
      <button type="button" onClick={() => onStatusFilter("On Hold")} style={railStatStyle("var(--status-error)")}>
        <span>On hold</span>
        <strong>{metrics.onHold.length}</strong>
      </button>
      <button type="button" onClick={() => onRiskFilter("high")} style={railStatStyle("var(--status-warning)")}>
        <span>Drawing gaps</span>
        <strong>{metrics.drawingGaps.length}</strong>
      </button>
      <button type="button" onClick={() => onPhaseFilter("Detailing")} style={railStatStyle("var(--status-success)")}>
        <span>Ready for fab</span>
        <strong>{metrics.readyForFab.length}</strong>
      </button>

      <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 12 }}>
        <div style={miniLabelStyle}>Watch list</div>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {watchList.length ? watchList.map((wp) => (
            <button key={wp.id} type="button" onClick={() => onOpen(wp)} style={watchItemStyle(wp._signals.risk)}>
              <span style={{ minWidth: 0 }}>
                <span style={watchTitleStyle}>{wp.wp_number || "WP"} - {wp.name || "Unnamed package"}</span>
                <span style={watchMetaStyle}>
                  {wp._signals.flags[0]?.label || "Review"} / {wp._signals.phase} / {formatTons(wp.tonnage)}
                </span>
              </span>
              <span style={riskDotStyle(wp._signals.risk)} />
            </button>
          )) : (
            <div style={emptyRailStyle}>No active package exceptions.</div>
          )}
        </div>
      </div>
    </aside>
  );
}

function PhaseFlowView({ rows, phaseRollup, onOpen, onEdit, onDelete, selectedWPs, onToggleSelect }) {
  if (!rows.length) return <NoPackages />;

  return (
    <div className="wp-phase-flow" style={phaseFlowStyle}>
      {PHASE_ORDER.map((phase) => {
        const items = rows.filter((wp) => wp._signals.phase === phase);
        const rollup = phaseRollup.find((row) => row.phase === phase);
        const Icon = PHASE_META[phase].icon;
        return (
          <section key={phase} style={laneStyle(phase)}>
            <div style={laneHeaderStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span style={laneIconStyle(phase)}><Icon size={15} /></span>
                <div>
                  <div style={{ ...display, fontSize: 15, fontWeight: 900, color: "var(--text-primary)" }}>{PHASE_META[phase].label}</div>
                  <div style={laneDescriptionStyle}>{PHASE_META[phase].description}</div>
                </div>
              </div>
              <div style={laneCountStyle(phase)}>{items.length}</div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <ProgressBar value={rollup?.progress || 0} color={phaseColor(phase)} height={5} sub={`${formatTons(rollup?.tons || 0)} - ${rollup?.progress || 0}%`} />
            </div>

            <div style={{ display: "grid", gap: 9 }}>
              {items.map((wp) => (
                <WorkPackageCard
                  key={wp.id}
                  wp={wp}
                  selected={selectedWPs.has(wp.id)}
                  onToggle={() => onToggleSelect(wp.id)}
                  onOpen={() => onOpen(wp)}
                  onEdit={() => onEdit(wp)}
                  onDelete={() => onDelete(wp)}
                />
              ))}
              {!items.length && <div style={laneEmptyStyle}>No packages in this phase</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StatusBoardView({ rows, onOpen, onEdit, onDelete }) {
  if (!rows.length) return <NoPackages />;

  return (
    <div style={statusBoardStyle}>
      {STATUS_OPTIONS.map((status) => {
        const items = rows.filter((wp) => wp._signals.status === status);
        const tons = items.reduce((sum, wp) => sum + num(wp.tonnage), 0);
        return (
          <section key={status} style={statusColumnStyle(status)}>
            <div style={statusColumnHeaderStyle}>
              <span>{status}</span>
              <strong>{items.length} / {formatTons(tons)}</strong>
            </div>
            <div style={{ display: "grid", gap: 9 }}>
              {items.map((wp) => (
                <CompactPackageCard key={wp.id} wp={wp} onOpen={() => onOpen(wp)} onEdit={() => onEdit(wp)} onDelete={() => onDelete(wp)} />
              ))}
              {!items.length && <div style={laneEmptyStyle}>No packages</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RegisterView({ rows, selectedWPs, onToggleSelect, onOpen, onEdit, onDelete }) {
  if (!rows.length) return <NoPackages />;

  return (
    <section style={registerShellStyle}>
      <div style={registerHeaderStyle}>
        <span />
        <span>WP</span>
        <span>Package</span>
        <span>Phase</span>
        <span>Status</span>
        <span>Progress</span>
        <span>Readiness</span>
        <span>Labor</span>
        <span />
      </div>
      {rows.map((wp) => (
        <div key={wp.id} onClick={() => onOpen(wp)} style={registerRowStyle(wp._signals.risk)}>
          <input
            type="checkbox"
            checked={selectedWPs.has(wp.id)}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleSelect(wp.id)}
            aria-label={`Select ${wp.wp_number || "work package"}`}
          />
          <span style={wpNumberStyle}>{wp.wp_number || "-"}</span>
          <span style={{ minWidth: 0 }}>
            <span style={packageNameStyle}>{wp.name || "Unnamed package"}</span>
            <span style={subLineStyle}>{wp.crew || "No crew"} / {formatTons(wp.tonnage)}</span>
          </span>
          <PhaseBadge phase={wp._signals.phase} />
          <StatusPill label={wp._signals.status} />
          <ProgressBar value={wp._signals.progress} color={phaseColor(wp._signals.phase)} height={4} sub={`${wp._signals.progress}%`} />
          <Readiness value={wp._signals.readinessScore} />
          <span style={laborLabelStyle(wp._signals.hourBurn)}>{wp._signals.totalBudgetHours ? `${wp._signals.hourBurn}%` : "-"}</span>
          <RowActions onEdit={(event) => { event.stopPropagation(); onEdit(wp); }} onDelete={(event) => { event.stopPropagation(); onDelete(wp); }} />
        </div>
      ))}
    </section>
  );
}

function WorkPackageCard({ wp, selected, onToggle, onOpen, onEdit, onDelete }) {
  const signals = wp._signals;
  return (
    <article onClick={onOpen} style={packageCardStyle(signals.risk, selected)}>
      <div style={cardTopStyle}>
        <input
          type="checkbox"
          checked={selected}
          onClick={(event) => event.stopPropagation()}
          onChange={onToggle}
          aria-label={`Select ${wp.wp_number || "work package"}`}
        />
        <span style={wpNumberStyle}>{wp.wp_number || "WP"}</span>
        <div style={{ flex: 1 }} />
        <StatusPill label={signals.status} size="xs" />
      </div>
      <div style={packageNameStyle}>{wp.name || "Unnamed package"}</div>
      <div style={cardMetaGridStyle}>
        <Fact icon={Package} label="Tons" value={formatTons(wp.tonnage)} />
        <Fact icon={Users} label="Crew" value={wp.crew || "Open"} />
        <Fact icon={CalendarDays} label="Plan" value={formatDateShort(wp.scheduled_end_date || wp.due_date)} />
      </div>
      <ProgressBar value={signals.progress} color={phaseColor(signals.phase)} height={5} sub={`${signals.progress}% complete`} />
      <div style={flagWrapStyle}>
        <Readiness value={signals.readinessScore} />
        {signals.flags.slice(0, 2).map((flag) => <Flag key={flag.key} flag={flag} />)}
        {!signals.flags.length && <Flag flag={{ label: "No blockers", severity: "clear" }} />}
      </div>
      <div style={cardFooterStyle}>
        <span style={subLineStyle}>{signals.drawing.approvedCount}/{signals.drawing.linkedCount || 0} drawings released</span>
        <RowActions onEdit={(event) => { event.stopPropagation(); onEdit(); }} onDelete={(event) => { event.stopPropagation(); onDelete(); }} />
      </div>
    </article>
  );
}

function CompactPackageCard({ wp, onOpen, onEdit, onDelete }) {
  const signals = wp._signals;
  return (
    <article onClick={onOpen} style={compactCardStyle(signals.risk)}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={wpNumberStyle}>{wp.wp_number || "WP"}</span>
        <PhaseBadge phase={signals.phase} />
      </div>
      <div style={packageNameStyle}>{wp.name || "Unnamed package"}</div>
      <ProgressBar value={signals.progress} color={phaseColor(signals.phase)} height={4} sub={`${formatTons(wp.tonnage)} - ${signals.progress}%`} />
      <div style={cardFooterStyle}>
        <span style={subLineStyle}>{signals.flags[0]?.label || wp.crew || "No blockers"}</span>
        <RowActions onEdit={(event) => { event.stopPropagation(); onEdit(); }} onDelete={(event) => { event.stopPropagation(); onDelete(); }} />
      </div>
    </article>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone }) {
  return (
    <div style={metricCardStyle(tone)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <span style={metricLabelStyle}>{label}</span>
        <Icon size={15} color={tone} />
      </div>
      <div style={{ ...mono, fontSize: 25, lineHeight: 1, fontWeight: 900, color: tone, marginTop: 10 }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div style={filterGroupStyle}>
      <span style={filterLabelStyle}>{label}</span>
      {children}
    </div>
  );
}

function FilterButton({ active, tone = "var(--accent)", onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={filterButtonStyle(active, tone)}>
      {children}
    </button>
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div style={factStyle}>
      <Icon size={12} color="var(--text-muted)" />
      <span>
        <span style={factLabelStyle}>{label}</span>
        <span style={factValueStyle}>{value}</span>
      </span>
    </div>
  );
}

function PhaseBadge({ phase }) {
  const Icon = PHASE_META[phase]?.icon || Package;
  return (
    <span style={phaseBadgeStyle(phase)}>
      <Icon size={10} />
      {PHASE_META[phase]?.short || phase || "Phase"}
    </span>
  );
}

function Readiness({ value }) {
  const tone = value >= 80 ? "var(--status-success)" : value >= 55 ? "var(--status-warning)" : "var(--status-error)";
  return <span style={readinessStyle(tone)}>{value}% ready</span>;
}

function Flag({ flag }) {
  const tone = flag.severity === "high"
    ? "var(--status-error)"
    : flag.severity === "medium"
      ? "var(--status-warning)"
      : "var(--status-success)";
  return <span style={flagStyle(tone)}>{flag.label}</span>;
}

function RowActions({ onEdit, onDelete }) {
  return (
    <span style={{ display: "inline-flex", gap: 5 }}>
      <button type="button" onClick={onEdit} title="Edit" aria-label="Edit work package" style={iconButtonStyle}>
        <Pencil size={12} />
      </button>
      <button type="button" onClick={onDelete} title="Delete" aria-label="Delete work package" style={iconButtonStyle}>
        <Trash2 size={12} />
      </button>
    </span>
  );
}

function NoPackages() {
  return (
    <EmptyState
      icon="wp"
      title="No work packages match this view"
      body="Adjust the search, phase, status, or risk filters to bring packages back into view."
    />
  );
}

const pageStyle = {
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  minWidth: 0,
};

const heroStyle = {
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, white 16%)",
  borderRadius: 18,
  background: "linear-gradient(135deg, color-mix(in srgb, var(--bg-surface-high) 94%, #000 6%), color-mix(in srgb, var(--bg-surface) 86%, #000 14%))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 42px rgba(0,0,0,0.30)",
  padding: 18,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 18,
  alignItems: "end",
};

const eyebrowStyle = {
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--accent)",
};

const heroTitleStyle = {
  ...display,
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 900,
  color: "var(--text-primary)",
  marginTop: 6,
};

const heroMetaStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
  ...mono,
  fontSize: 9,
  fontWeight: 800,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const heroActionStyle = {
  display: "grid",
  gap: 10,
  justifyItems: "end",
};

const viewToggleStyle = {
  display: "inline-flex",
  gap: 5,
  padding: 5,
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "var(--bg-surface-low)",
};

const viewButtonStyle = (active) => ({
  height: 30,
  padding: "0 10px",
  border: `1px solid ${active ? "var(--accent)" : "transparent"}`,
  borderRadius: 10,
  background: active ? "var(--accent-muted)" : "transparent",
  color: active ? "var(--accent)" : "var(--text-secondary)",
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  cursor: "pointer",
});

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const metricCardStyle = (tone) => ({
  minHeight: 114,
  border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
  borderRadius: 14,
  padding: 13,
  background: `linear-gradient(145deg, color-mix(in srgb, ${tone} 8%, var(--bg-surface-high)), var(--bg-surface-low))`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 24px rgba(0,0,0,0.24)",
});

const metricLabelStyle = {
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.13em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const phaseMetricStyle = (phase, active) => ({
  textAlign: "left",
  minHeight: 114,
  border: `1px solid ${active ? phaseColor(phase) : "var(--border-default)"}`,
  borderRadius: 14,
  padding: 13,
  background: active
    ? `linear-gradient(145deg, color-mix(in srgb, ${phaseColor(phase)} 14%, var(--bg-surface-high)), var(--bg-surface-low))`
    : "var(--bg-surface)",
  cursor: "pointer",
});

const controlPanelStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  padding: 10,
  background: "var(--bg-surface)",
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const searchBoxStyle = {
  minWidth: 240,
  flex: "1 1 300px",
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "var(--bg-input)",
};

const searchInputStyle = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "var(--text-primary)",
  fontSize: 12,
  fontFamily: "var(--font-body)",
};

const filterGroupStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
};

const filterLabelStyle = {
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  marginRight: 2,
};

const filterButtonStyle = (active, tone) => ({
  minHeight: 26,
  padding: "0 8px",
  borderRadius: 8,
  border: `1px solid ${active ? tone : "var(--border-default)"}`,
  background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : "var(--bg-surface-low)",
  color: active ? tone : "var(--text-secondary)",
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const countLabelStyle = {
  ...mono,
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const clearButtonStyle = {
  border: "1px solid var(--accent-border)",
  borderRadius: 8,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  padding: "6px 9px",
  cursor: "pointer",
};

const contentGridStyle = {
  display: "grid",
  gridTemplateColumns: "300px minmax(0, 1fr)",
  gap: 14,
  alignItems: "start",
};

const sideRailStyle = {
  position: "sticky",
  top: 12,
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  background: "linear-gradient(180deg, var(--bg-surface-high), var(--bg-surface))",
  padding: 14,
  display: "grid",
  gap: 10,
  boxShadow: "0 14px 34px rgba(0,0,0,0.24)",
};

const panelHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  paddingBottom: 4,
};

const panelTitleStyle = {
  ...display,
  fontSize: 18,
  fontWeight: 900,
  color: "var(--text-primary)",
};

const railStatStyle = (tone) => ({
  width: "100%",
  border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
  borderRadius: 12,
  background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 9%, transparent), transparent)`,
  padding: "9px 10px",
  color: "var(--text-secondary)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  cursor: "pointer",
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
});

const miniLabelStyle = {
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const watchItemStyle = (risk) => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--status-success)";
  return {
    border: `1px solid color-mix(in srgb, ${tone} 26%, var(--border-default))`,
    borderRadius: 11,
    background: "var(--bg-surface-low)",
    padding: "8px 9px",
    color: "inherit",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 8px",
    gap: 8,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
  };
};

const watchTitleStyle = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: 12,
  fontWeight: 850,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const watchMetaStyle = {
  display: "block",
  ...mono,
  fontSize: 8,
  color: "var(--text-muted)",
  marginTop: 3,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const riskDotStyle = (risk) => ({
  width: 8,
  height: 8,
  borderRadius: 8,
  background: risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--status-success)",
});

const emptyRailStyle = {
  border: "1px dashed var(--border-default)",
  borderRadius: 10,
  padding: 12,
  color: "var(--text-muted)",
  fontSize: 12,
  textAlign: "center",
};

const phaseFlowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
  alignItems: "start",
  overflowX: "visible",
  paddingBottom: 4,
};

const laneStyle = (phase) => ({
  minWidth: 0,
  border: `1px solid color-mix(in srgb, ${phaseColor(phase)} 30%, var(--border-default))`,
  borderRadius: 16,
  background: "linear-gradient(180deg, var(--bg-surface), var(--bg-surface-low))",
  padding: 12,
});

const laneHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 12,
};

const laneIconStyle = (phase) => ({
  width: 30,
  height: 30,
  borderRadius: 10,
  display: "grid",
  placeItems: "center",
  color: phaseColor(phase),
  background: `color-mix(in srgb, ${phaseColor(phase)} 12%, transparent)`,
  border: `1px solid color-mix(in srgb, ${phaseColor(phase)} 32%, transparent)`,
  flexShrink: 0,
});

const laneDescriptionStyle = {
  color: "var(--text-muted)",
  fontSize: 11,
  lineHeight: 1.35,
  marginTop: 2,
};

const laneCountStyle = (phase) => ({
  ...mono,
  fontSize: 13,
  fontWeight: 900,
  color: phaseColor(phase),
});

const laneEmptyStyle = {
  border: "1px dashed var(--border-default)",
  borderRadius: 12,
  padding: 16,
  color: "var(--text-muted)",
  textAlign: "center",
  ...mono,
  fontSize: 9,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const statusBoardStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 12,
};

const statusColumnStyle = (status) => ({
  border: `1px solid color-mix(in srgb, ${STATUS_TONE[status]} 28%, var(--border-default))`,
  borderTop: `3px solid ${STATUS_TONE[status]}`,
  borderRadius: 16,
  background: "var(--bg-surface)",
  padding: 12,
});

const statusColumnHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  marginBottom: 10,
  ...mono,
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
};

const packageCardStyle = (risk, selected) => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--border-default)";
  return {
    border: `1px solid ${selected ? "var(--accent)" : tone}`,
    borderRadius: 13,
    padding: 10,
    background: selected ? "var(--accent-muted)" : "var(--bg-surface-high)",
    display: "grid",
    gap: 9,
    cursor: "pointer",
    boxShadow: selected ? "0 0 0 1px var(--accent-border)" : "inset 0 1px 0 rgba(255,255,255,0.04)",
  };
};

const compactCardStyle = (risk) => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--border-default)";
  return {
    border: `1px solid ${tone}`,
    borderRadius: 13,
    padding: 10,
    background: "var(--bg-surface-high)",
    display: "grid",
    gap: 8,
    cursor: "pointer",
  };
};

const cardTopStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const wpNumberStyle = {
  ...mono,
  color: "var(--accent)",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};

const packageNameStyle = {
  display: "block",
  color: "var(--text-primary)",
  fontSize: 13,
  lineHeight: 1.3,
  fontWeight: 850,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const subLineStyle = {
  display: "block",
  color: "var(--text-muted)",
  fontSize: 10,
  lineHeight: 1.35,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const cardMetaGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 6,
};

const factStyle = {
  minWidth: 0,
  border: "1px solid var(--border-default)",
  borderRadius: 9,
  padding: "6px 7px",
  display: "flex",
  gap: 6,
  alignItems: "center",
  background: "var(--bg-surface)",
};

const factLabelStyle = {
  display: "block",
  ...mono,
  fontSize: 7,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
};

const factValueStyle = {
  display: "block",
  ...mono,
  fontSize: 9,
  color: "var(--text-primary)",
  fontWeight: 900,
  marginTop: 1,
};

const flagWrapStyle = {
  display: "flex",
  gap: 5,
  alignItems: "center",
  flexWrap: "wrap",
};

const flagStyle = (tone) => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  padding: "0 7px",
  borderRadius: 7,
  border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
  background: `color-mix(in srgb, ${tone} 10%, transparent)`,
  color: tone,
  ...mono,
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

const readinessStyle = (tone) => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: 20,
  padding: "0 7px",
  borderRadius: 7,
  border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
  background: `color-mix(in srgb, ${tone} 10%, transparent)`,
  color: tone,
  ...mono,
  fontSize: 7,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

const cardFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  alignItems: "center",
};

const iconButtonStyle = {
  width: 24,
  height: 24,
  border: "1px solid var(--border-default)",
  borderRadius: 7,
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  cursor: "pointer",
};

const phaseBadgeStyle = (phase) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  width: "fit-content",
  minHeight: 22,
  padding: "0 7px",
  borderRadius: 8,
  border: `1px solid color-mix(in srgb, ${phaseColor(phase)} 36%, transparent)`,
  background: `color-mix(in srgb, ${phaseColor(phase)} 12%, transparent)`,
  color: phaseColor(phase),
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

const registerShellStyle = {
  border: "1px solid var(--border-default)",
  borderRadius: 16,
  background: "var(--bg-surface)",
  overflowX: "auto",
  overflowY: "hidden",
};

const registerHeaderStyle = {
  display: "grid",
  gridTemplateColumns: "26px 86px minmax(220px, 1.4fr) 110px 116px 132px 92px 70px 58px",
  gap: 10,
  alignItems: "center",
  minWidth: 900,
  padding: "9px 12px",
  borderBottom: "1px solid var(--divider)",
  background: "var(--bg-surface-low)",
  ...mono,
  fontSize: 8,
  fontWeight: 900,
  color: "var(--text-muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const registerRowStyle = (risk) => {
  const tone = risk === "high" ? "var(--status-error)" : risk === "medium" ? "var(--status-warning)" : "var(--divider)";
  return {
    display: "grid",
    gridTemplateColumns: "26px 86px minmax(220px, 1.4fr) 110px 116px 132px 92px 70px 58px",
    gap: 10,
    alignItems: "center",
    minWidth: 900,
    padding: "10px 12px",
    borderBottom: "1px solid var(--divider)",
    borderLeft: `3px solid ${tone}`,
    cursor: "pointer",
  };
};

const laborLabelStyle = (burn) => ({
  ...mono,
  fontSize: 10,
  fontWeight: 900,
  color: burn > 100 ? "var(--status-error)" : burn >= 85 ? "var(--status-warning)" : "var(--text-secondary)",
});

const RESPONSIVE_CSS = `
@media (max-width: 1180px) {
  .wp-content-grid {
    grid-template-columns: 1fr !important;
  }
  .wp-phase-flow {
    grid-template-columns: repeat(2, minmax(260px, 1fr)) !important;
  }
}

@media (max-width: 760px) {
  .wp-hero {
    grid-template-columns: 1fr !important;
  }
  .wp-phase-flow {
    grid-template-columns: 1fr !important;
    overflow-x: visible !important;
  }
}
`;
