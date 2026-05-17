/**
 * Deliveries - logistics control surface for shipping tickets, load-out,
 * in-transit tracking, receiving, and exception follow-up.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  LayoutGrid,
  List,
  MapPin,
  PackageCheck,
  Search,
  Truck,
  Warehouse,
  Weight,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/ProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import { useAutoOpenCreate } from "@/hooks/useAutoOpenCreate";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  replaceRecordInCaches,
  removeRecordFromCaches,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import DeliveryFormModal from "@/components/deliveries/DeliveryFormModal";
import ShippingTicketImportModal from "@/components/deliveries/ShippingTicketImportModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { batchProcess } from "@/utils/batchProcess";
import { BulkActionBar, Button, EmptyState, ProgressBar, StatusPill } from "@/components/design-system";
import SequenceFilter, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { exportDeliveriesCSV, isFabComplete } from "./deliveries/utils";
import {
  buildDeliveryMetrics,
  deliveryLane,
  getDeliveryDisplayName,
  sortDeliveriesForDispatch,
} from "./deliveries/analytics";

const VIEW_OPTIONS = [
  { id: "dispatch", label: "Dispatch", icon: LayoutGrid },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "register", label: "Register", icon: List },
];

const LANE_ORDER = ["Exceptions", "Scheduled", "Loading", "In Transit", "Delivered"];
const SCHEDULE_FILTERS = [
  { id: "all", label: "All Loads" },
  { id: "late", label: "Late" },
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "ready", label: "Ready" },
  { id: "unscheduled", label: "No Date" },
  { id: "longLead", label: "Long Lead" },
];
const RISK_FILTERS = [
  { id: "all", label: "All Risk" },
  { id: "high", label: "Exceptions" },
  { id: "medium", label: "Warnings" },
  { id: "clear", label: "Clear" },
];
const STATUS_COLOR = {
  Scheduled: "var(--status-info)",
  Loading: "var(--status-warning)",
  "In Transit": "var(--phase-delivery)",
  Delivered: "var(--status-success)",
  Partial: "var(--status-warning)",
  Delayed: "var(--status-error)",
  Rejected: "var(--status-error)",
  Exceptions: "var(--status-error)",
};
const display = { fontFamily: "var(--font-display)" };
const mono = { fontFamily: "var(--font-mono)" };

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value, fallback = "TBD") {
  const parsed = dateValue(value);
  if (!parsed) return fallback;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTons(value) {
  return `${num(value).toFixed(1)}T`;
}

function formatPieces(value) {
  const pieces = num(value);
  return pieces ? pieces.toLocaleString() : "0";
}

function riskColor(risk) {
  if (risk === "high") return "var(--status-error)";
  if (risk === "medium") return "var(--status-warning)";
  return "var(--status-success)";
}

export default function Deliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const receiveMode = searchParams.get("receive") === "1";

  const [view, setView] = useState("dispatch");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  useAutoOpenCreate(() => {
    setEditing(null);
    setDetail(null);
    setShowForm(true);
  });

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["deliveries", projectId || "all"],
    queryFn: () =>
      projectId ? base44.entities.Delivery.filter({ project_id: projectId }) : base44.entities.Delivery.list(),
    staleTime: 60000,
    refetchInterval: 60000,
  });

  useRealtimeInvalidation("deliveries", projectId, [["deliveries", projectId || "all"]]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId || "all"],
    queryFn: () =>
      projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : base44.entities.WorkPackage.list(),
    staleTime: 60000,
  });

  const projectMap = useMemo(() => {
    const map = {};
    for (const project of projects) map[project.id] = project.name || project.project_name || "";
    return map;
  }, [projects]);

  const workPackageMap = useMemo(() => {
    const map = {};
    for (const wp of workPackages) map[wp.id] = wp;
    return map;
  }, [workPackages]);

  const wpLabelMap = useMemo(() => {
    const map = {};
    for (const wp of workPackages) map[wp.id] = wp.wp_number || wp.name || "";
    return map;
  }, [workPackages]);

  const activeDeliveries = useMemo(
    () => deliveries.filter((delivery) => !delivery?.is_deleted),
    [deliveries]
  );

  const metrics = useMemo(
    () => buildDeliveryMetrics(activeDeliveries, workPackages),
    [activeDeliveries, workPackages]
  );

  useEffect(() => {
    if (!receiveMode) return;
    setView("schedule");
    setRiskFilter("all");
    setScheduleFilter(
      metrics.overdue.length
        ? "late"
        : metrics.dueToday.length
          ? "today"
          : metrics.readyToReceive.length
            ? "ready"
            : "all"
    );
  }, [metrics.dueToday.length, metrics.overdue.length, metrics.readyToReceive.length, receiveMode]);

  const invalidateDeliveries = () => invalidateEntity(qc, "delivery", projectId);
  const deliveryQueryKeys = [["deliveries", projectId || "all"], ["deliveries"]];

  const transitMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Delivery.update(id, data),
    onSuccess: async (updated, variables) => {
      replaceRecordInCaches(qc, deliveryQueryKeys, updated);
      await invalidateDeliveries();
      setDetail((prev) => (prev?.id === variables.id ? null : prev));
      toast.success("Delivery status updated");
    },
    onError: (e) => toastCrudError(e, "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Delivery.delete(id),
    onSuccess: async (_result, deletedId) => {
      removeRecordFromCaches(qc, deliveryQueryKeys, deletedId);
      await invalidateDeliveries();
      if (detail?.id === deleteTarget?.id) setDetail(null);
      if (editing?.id === deleteTarget?.id) setEditing(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (deleteTarget?.id) next.delete(deleteTarget.id);
        return next;
      });
      setDeleteTarget(null);
      toast.success("Delivery removed");
    },
    onError: (e) => toastCrudError(e, "Delete failed"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, status }) => {
      const { succeeded, failed } = await batchProcess(ids, (id) =>
        base44.entities.Delivery.update(id, {
          status,
          actual_date: status === "Delivered" ? todayIso() : null,
        })
      );
      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`All ${failed.length} updates failed.`);
      }
      return { succeeded, failed };
    },
    onSuccess: async (results) => {
      await invalidateDeliveries();
      setSelectedIds(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Deliveries updated");
      }
    },
    onError: (e) => toastCrudError(e, "Bulk update failed"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics.enriched
      .filter((delivery) => {
        const signals = delivery._signals;
        if (statusFilter !== "all" && signals.status !== statusFilter) return false;
        if (riskFilter !== "all" && signals.risk !== riskFilter) return false;
        if (scheduleFilter === "late" && !signals.overdue) return false;
        if (scheduleFilter === "today" && !signals.dueToday) return false;
        if (scheduleFilter === "week" && !signals.dueNext7) return false;
        if (scheduleFilter === "ready" && !metrics.readyToReceive.some((item) => item.id === delivery.id)) return false;
        if (scheduleFilter === "unscheduled" && !signals.unscheduled) return false;
        if (scheduleFilter === "longLead" && !signals.longLead) return false;
        if (!matchesSequenceFilter(delivery, seqFilter)) return false;
        if (!q) return true;
        const wp = workPackageMap[delivery.work_package_id];
        const haystack = [
          delivery.delivery_number,
          delivery.delivery_title,
          delivery.description,
          delivery.vendor,
          delivery.po_number,
          delivery.carrier,
          delivery.tracking_number,
          delivery.truck_number,
          delivery.load_number,
          delivery.load_category,
          delivery.procurement_category,
          delivery.receiving_location,
          projectMap[delivery.project_id],
          wp?.wp_number,
          wp?.name,
        ].join(" ").toLowerCase();
        return haystack.includes(q);
      })
      .sort(sortDeliveriesForDispatch);
  }, [metrics, projectMap, riskFilter, scheduleFilter, seqFilter, search, statusFilter, workPackageMap]);

  const laneGroups = useMemo(() => {
    const groups = Object.fromEntries(LANE_ORDER.map((lane) => [lane, []]));
    for (const delivery of filtered) {
      const lane = deliveryLane(delivery);
      if (!groups[lane]) groups.Exceptions.push(delivery);
      else groups[lane].push(delivery);
    }
    return groups;
  }, [filtered]);

  useEffect(() => {
    if (!projectId || !metrics.overdue.length) return undefined;
    const createDeliveryAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "Delivery_Overdue" });
        const existingIds = new Set(existing.map((alert) => alert.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((alert) => alert.title));
        for (const delivery of metrics.overdue) {
          if (existingIds.has(delivery.id)) continue;
          const projectName = projectMap[delivery.project_id] || "";
          const wp = workPackageMap[delivery.work_package_id];
          const desc = getDeliveryDisplayName(delivery, wp);
          const daysLate = delivery._signals.flags.find((flag) => flag.key === "overdue")?.label || "late";
          const alertTitle = `Delivery from ${delivery.vendor || "Unknown"} is ${daysLate}`;
          if (existingTitles.has(alertTitle)) continue;
          await base44.entities.Alert.create({
            alert_type: "Delivery_Overdue",
            severity: delivery._signals.risk === "high" ? "High" : "Medium",
            title: alertTitle,
            description: `${desc} from ${delivery.vendor || "Unknown"} - PO: ${delivery.po_number || "TBD"} - Scheduled: ${delivery.scheduled_date || "TBD"} - Status: ${delivery.status || "Scheduled"} - Project: ${projectName}`,
            related_record_id: delivery.id,
            project_id: delivery.project_id,
            project_name: projectName,
          });
        }
      } catch (error) {
        console.warn("Delivery alert error:", error);
      }
    };
    const timer = setTimeout(createDeliveryAlerts, 4000);
    return () => clearTimeout(timer);
  }, [metrics.overdue, projectId, projectMap, workPackageMap]);

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((delivery) => delivery.id)) : new Set());

  const handleProjectSelect = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("project", value);
    else {
      next.delete("project");
      next.delete("projectId");
    }
    setSearchParams(next);
  };

  const clearReceiveMode = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("receive");
    setSearchParams(next, { replace: true });
  };

  const setDeliveryStatus = (delivery, status) => {
    if (!delivery || transitMut.isPending) return;
    if (status === "Delivered" && !isFabComplete(delivery, workPackages)) {
      const wp = workPackages.find((item) => item.id === delivery.work_package_id);
      toast.error(`Cannot mark delivered - WP "${wp?.name || wp?.wp_number || "linked"}" fabrication is not complete`);
      return;
    }
    transitMut.mutate({
      id: delivery.id,
      data: {
        status,
        actual_date: status === "Delivered" ? todayIso() : null,
      },
    });
  };

  const bulkUpdate = (status) => {
    const ids = Array.from(selectedIds);
    if (!ids.length || bulkUpdateMut.isPending) return;
    if (status === "Delivered") {
      const blocked = ids.filter((id) => {
        const delivery = activeDeliveries.find((item) => item.id === id);
        return delivery && !isFabComplete(delivery, workPackages);
      });
      if (blocked.length > 0) {
        toast.error(`${blocked.length} delivery(ies) blocked - linked work package fabrication is not complete`);
        return;
      }
    }
    bulkUpdateMut.mutate({ ids, status });
  };

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projectMap[projectId] || activeProject?.name || "All Projects";
  const selectedDeliveries = filtered.filter((delivery) => selectedIds.has(delivery.id));

  return (
    <div className="delivery-page">
      <style>{deliveryStyles}</style>

      <section className="delivery-hero">
        <div className="delivery-hero-main">
          <div className="delivery-kicker">
            <Truck size={14} />
            Logistics Control - {projectName}
          </div>
          <h1 style={display}>Deliveries</h1>
          <p>
            Plan load-out, spot late trucks, confirm receiving, and keep field-ready steel visible before it
            turns into a site constraint.
          </p>
          <div className="delivery-hero-actions">
            <Button
              variant="secondary"
              icon="download"
              onClick={() => exportDeliveriesCSV(filtered, projectMap, wpLabelMap)}
            >
              CSV
            </Button>
            {can("create", "delivery") && (
              <Button variant="outline" icon="upload" onClick={() => setShowImport(true)}>
                Import Ticket
              </Button>
            )}
            {can("create", "delivery") && (
              <Button
                variant="primary"
                icon="plus"
                onClick={() => {
                  setEditing(null);
                  setDetail(null);
                  setShowForm(true);
                }}
              >
                Schedule Load
              </Button>
            )}
          </div>
        </div>
        <div className="delivery-hero-grid">
          <HeroMetric
            label="Open Loads"
            value={metrics.openCount}
            sub={`${formatTons(metrics.totalOpenTons)} inbound`}
            color="var(--phase-delivery)"
            icon={PackageCheck}
          />
          <HeroMetric
            label="Due Today"
            value={metrics.dueToday.length}
            sub={`${formatTons(metrics.dueToday.reduce((sum, d) => sum + num(d.weight_tons), 0))} scheduled`}
            color="var(--status-warning)"
            icon={Clock3}
          />
          <HeroMetric
            label="Exceptions"
            value={metrics.exceptions.length}
            sub={`${metrics.overdue.length} late loads`}
            color={metrics.exceptions.length ? "var(--status-error)" : "var(--status-success)"}
            icon={AlertTriangle}
          />
          <HeroMetric
            label="Ready To Receive"
            value={metrics.readyToReceive.length}
            sub={`${metrics.deliveredLast7.length} received in 7d`}
            color="var(--status-success)"
            icon={CheckCircle2}
          />
        </div>
      </section>

      {receiveMode && (
        <ReceivingQuickPanel
          metrics={metrics}
          projectMap={projectMap}
          workPackageMap={workPackageMap}
          onOpen={setDetail}
          onExit={clearReceiveMode}
          onFilter={(filter) => {
            setView("schedule");
            setScheduleFilter(filter);
            setRiskFilter("all");
          }}
          onScheduleLoad={() => {
            setEditing(null);
            setDetail(null);
            setShowForm(true);
          }}
        />
      )}

      <section className="delivery-flow-strip">
        <div className="delivery-flow-header">
          <div>
            <div className="delivery-section-label">Load Pipeline</div>
            <div className="delivery-muted">Status mix across active and recently completed delivery records.</div>
          </div>
          <div className="delivery-flow-total" style={mono}>
            {metrics.totalOpenPieces.toLocaleString()} open pcs
          </div>
        </div>
        <div className="delivery-status-flow">
          {metrics.statusRollup.map((item) => (
            <button
              key={item.status}
              className={`delivery-status-step ${statusFilter === item.status ? "is-active" : ""}`}
              onClick={() => setStatusFilter(statusFilter === item.status ? "all" : item.status)}
              style={{ "--step-color": STATUS_COLOR[item.status] || "var(--text-muted)" }}
            >
              <span>{item.status}</span>
              <strong>{item.count}</strong>
              <small>{formatTons(item.tons)}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="delivery-toolbar">
        <div className="delivery-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search vendor, PO, load, carrier, truck, work package..."
          />
        </div>
        {!projectId && (
          <select value={projectId || ""} onChange={(event) => handleProjectSelect(event.target.value)}>
            <option value="">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name || project.project_name}
              </option>
            ))}
          </select>
        )}
        <FilterSelect value={scheduleFilter} onChange={setScheduleFilter} options={SCHEDULE_FILTERS} />
        <FilterSelect value={riskFilter} onChange={setRiskFilter} options={RISK_FILTERS} />
        <div className="delivery-view-toggle">
          {VIEW_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                className={view === option.id ? "is-active" : ""}
                onClick={() => setView(option.id)}
              >
                <Icon size={14} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <SequenceFilter items={activeDeliveries} value={seqFilter} onChange={setSeqFilter} />

      <section className="delivery-layout">
        <ExceptionRail
          metrics={metrics}
          projectMap={projectMap}
          workPackageMap={workPackageMap}
          onOpen={setDetail}
          onFilterLate={() => {
            setScheduleFilter("late");
            setRiskFilter("all");
          }}
        />

        <main className="delivery-main">
          <div className="delivery-view-header">
            <div>
              <div className="delivery-section-label">
                {view === "dispatch" ? "Dispatch Board" : view === "schedule" ? "Schedule Lookahead" : "Delivery Register"}
              </div>
              <div className="delivery-muted">
                {filtered.length} of {metrics.totalCount} deliveries shown
              </div>
            </div>
            <div className="delivery-header-actions">
              <StatusPill label={`${selectedIds.size} Selected`} color={selectedIds.size ? "var(--accent)" : "var(--text-muted)"} />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setScheduleFilter("all");
                  setRiskFilter("all");
                  setSeqFilter(null);
                  setSearch("");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>

          {view === "dispatch" && (
            <DispatchBoard
              laneGroups={laneGroups}
              projectMap={projectMap}
              workPackageMap={workPackageMap}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onOpen={setDetail}
              onSetStatus={setDeliveryStatus}
            />
          )}

          {view === "schedule" && (
            <ScheduleView
              metrics={metrics}
              filtered={filtered}
              projectMap={projectMap}
              workPackageMap={workPackageMap}
              onOpen={setDetail}
            />
          )}

          {view === "register" && (
            <RegisterView
              deliveries={filtered}
              projectMap={projectMap}
              workPackageMap={workPackageMap}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onToggleAll={toggleAll}
              onOpen={setDetail}
              onEdit={(delivery) => {
                setEditing(delivery);
                setDetail(null);
              }}
              allSelected={filtered.length > 0 && selectedIds.size === filtered.length}
            />
          )}

          {filtered.length === 0 && (
            <div className="delivery-empty">
              <EmptyState
                icon="delivery"
                title={metrics.totalCount === 0 ? "No deliveries tracked" : "No deliveries match your filters"}
                body={
                  metrics.totalCount === 0
                    ? "Schedule the first load or import a shipping ticket to start tracking field arrivals."
                    : "Clear filters or adjust the search to bring loads back into view."
                }
              />
            </div>
          )}
        </main>
      </section>

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: "In Transit", icon: "arrow", onClick: () => bulkUpdate("In Transit") },
          { label: "Delivered", icon: "check", variant: "primary", onClick: () => bulkUpdate("Delivered") },
          { label: "Partial", icon: "alert", onClick: () => bulkUpdate("Partial") },
          {
            label: "Export",
            icon: "download",
            onClick: () => exportDeliveriesCSV(selectedDeliveries, projectMap, wpLabelMap, "deliveries-selected.csv"),
          },
        ]}
      />

      <DeliveryDetailModal
        delivery={detail}
        projectMap={projectMap}
        workPackageMap={workPackageMap}
        onClose={() => setDetail(null)}
        onEdit={can("edit", "delivery") ? (delivery) => {
          setEditing(delivery);
          setDetail(null);
        } : null}
        onDelete={can("delete", "delivery") ? (delivery) => {
          setDeleteTarget(delivery);
          setDetail(null);
        } : null}
        onSetStatus={setDeliveryStatus}
      />

      {showForm && (
        <DeliveryFormModal
          projectId={projectId}
          onClose={() => {
            setShowForm(false);
            invalidateDeliveries();
          }}
        />
      )}
      {editing && (
        <DeliveryFormModal
          projectId={editing.project_id || projectId}
          delivery={editing}
          onClose={() => {
            setEditing(null);
            invalidateDeliveries();
          }}
        />
      )}
      <ShippingTicketImportModal
        open={showImport}
        projectId={projectId}
        projectName={activeProject?.name}
        projects={projects}
        onClose={() => {
          setShowImport(false);
          invalidateDeliveries();
        }}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete delivery?"
        description="This delivery will be removed."
      />
    </div>
  );
}

function HeroMetric({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="delivery-hero-metric" style={{ "--metric-color": color }}>
      <div className="delivery-hero-icon">
        <Icon size={17} />
      </div>
      <div className="delivery-metric-label">{label}</div>
      <div className="delivery-metric-value" style={mono}>{value}</div>
      <div className="delivery-metric-sub">{sub}</div>
    </div>
  );
}

function mergeDeliveryLists(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const delivery of list || []) {
      const key = delivery.id || [
        delivery.delivery_number,
        delivery.load_number,
        delivery.po_number,
        delivery.description,
      ].filter(Boolean).join(":");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(delivery);
    }
  }
  return merged;
}

function ReceivingQuickPanel({ metrics, projectMap, workPackageMap, onOpen, onExit, onFilter, onScheduleLoad }) {
  const focusLoads = mergeDeliveryLists(metrics.overdue, metrics.dueToday, metrics.readyToReceive).slice(0, 6);
  return (
    <section className="delivery-receive-panel" aria-label="Delivery receiving quick workflow">
      <div className="delivery-receive-copy">
        <div className="delivery-section-label">Field Receiving</div>
        <h2 style={display}>Confirm trucks without hunting through the register.</h2>
        <p>
          Review late, due-today, and ready-to-receive loads. Opening a load keeps the human approval step in the
          detail drawer before any status change is written.
        </p>
      </div>

      <div className="delivery-receive-actions">
        <button type="button" onClick={() => onFilter("late")}>
          <span>Late</span>
          <strong>{metrics.overdue.length}</strong>
        </button>
        <button type="button" onClick={() => onFilter("today")}>
          <span>Due Today</span>
          <strong>{metrics.dueToday.length}</strong>
        </button>
        <button type="button" onClick={() => onFilter("ready")}>
          <span>Ready</span>
          <strong>{metrics.readyToReceive.length}</strong>
        </button>
        <button type="button" onClick={onScheduleLoad}>
          <span>New</span>
          <strong>+</strong>
        </button>
      </div>

      <div className="delivery-receive-list">
        {focusLoads.length > 0 ? (
          focusLoads.map((delivery, index) => {
            const wp = workPackageMap[delivery.work_package_id];
            return (
              <button key={delivery.id || `${delivery.po_number}-${delivery.description}-${index}`} type="button" onClick={() => onOpen(delivery)}>
                <div>
                  <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                  <span>{delivery.vendor || "Vendor TBD"} - {projectMap[delivery.project_id] || delivery.project_name || "Project TBD"}</span>
                </div>
                <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" />
              </button>
            );
          })
        ) : (
          <div className="delivery-receive-empty">No late, due-today, or ready loads in the current project.</div>
        )}
      </div>

      <button type="button" className="delivery-receive-exit" onClick={onExit}>
        Exit receiving mode
      </button>
    </section>
  );
}

function FilterSelect({ value, onChange, options }) {
  return (
    <div className="delivery-filter-select">
      <Filter size={13} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ExceptionRail({ metrics, projectMap, workPackageMap, onOpen, onFilterLate }) {
  const watchList = metrics.exceptions.slice(0, 8);
  return (
    <aside className="delivery-rail">
      <div className="delivery-rail-header">
        <div>
          <div className="delivery-section-label">Exceptions</div>
          <div className="delivery-muted">Late, blocked, partial, rejected, or missing logistics.</div>
        </div>
        <button type="button" onClick={onFilterLate}>
          Late
        </button>
      </div>

      <div className="delivery-rail-kpis">
        <MiniStat label="Late" value={metrics.overdue.length} color="var(--status-error)" />
        <MiniStat label="7 Days" value={metrics.dueNext7.length} color="var(--status-warning)" />
        <MiniStat label="Long Lead" value={metrics.longLeadOpen.length} color="var(--accent)" />
      </div>

      <div className="delivery-watch-list">
        {watchList.length > 0 ? (
          watchList.map((delivery) => {
            const wp = workPackageMap[delivery.work_package_id];
            return (
              <button key={delivery.id} type="button" className="delivery-watch-card" onClick={() => onOpen(delivery)}>
                <div className="delivery-watch-top">
                  <StatusPill label={delivery._signals.risk === "high" ? "Exception" : "Warning"} color={riskColor(delivery._signals.risk)} size="xs" />
                  <span>{formatDate(delivery.scheduled_date)}</span>
                </div>
                <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                <small>
                  {delivery.vendor || "No vendor"} - {projectMap[delivery.project_id] || "Project TBD"}
                </small>
                <div className="delivery-flag-row">
                  {delivery._signals.flags.slice(0, 3).map((flag) => (
                    <span key={flag.key}>{flag.label}</span>
                  ))}
                </div>
              </button>
            );
          })
        ) : (
          <div className="delivery-rail-empty">
            <CheckCircle2 size={18} />
            No delivery exceptions in the current filter set.
          </div>
        )}
      </div>
    </aside>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="delivery-mini-stat">
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

function DispatchBoard({ laneGroups, projectMap, workPackageMap, selectedIds, onToggle, onOpen, onSetStatus }) {
  return (
    <div className="delivery-lane-scroll">
      <div className="delivery-lanes">
        {LANE_ORDER.map((lane) => {
          const items = laneGroups[lane] || [];
          const tons = items.reduce((sum, delivery) => sum + num(delivery.weight_tons), 0);
          return (
            <section key={lane} className="delivery-lane" style={{ "--lane-color": STATUS_COLOR[lane] || "var(--accent)" }}>
              <div className="delivery-lane-head">
                <div>
                  <div className="delivery-lane-title">{lane}</div>
                  <span>{items.length} loads - {formatTons(tons)}</span>
                </div>
              </div>
              <div className="delivery-lane-body">
                {items.slice(0, 24).map((delivery) => (
                  <DeliveryLoadCard
                    key={delivery.id}
                    delivery={delivery}
                    projectMap={projectMap}
                    workPackageMap={workPackageMap}
                    selected={selectedIds.has(delivery.id)}
                    onToggle={() => onToggle(delivery.id)}
                    onOpen={() => onOpen(delivery)}
                    onSetStatus={onSetStatus}
                  />
                ))}
                {items.length === 0 && <div className="delivery-lane-empty">No loads</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryLoadCard({ delivery, projectMap, workPackageMap, selected, onToggle, onOpen, onSetStatus }) {
  const wp = workPackageMap[delivery.work_package_id];
  const title = getDeliveryDisplayName(delivery, wp);
  const flags = delivery._signals.flags;
  return (
    <article className={`delivery-load-card ${selected ? "is-selected" : ""}`} onClick={onOpen}>
      <div className="delivery-card-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${title}`}
        />
        <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" />
        <span className="delivery-card-date">{formatDate(delivery.scheduled_date)}</span>
      </div>
      <h3>{title}</h3>
      <div className="delivery-card-meta">
        <span>{delivery.vendor || "Vendor TBD"}</span>
        <span>{delivery.po_number || delivery.load_number || "PO TBD"}</span>
      </div>
      <div className="delivery-card-grid">
        <MetaMini icon={Weight} label="Tons" value={formatTons(delivery.weight_tons)} />
        <MetaMini icon={Warehouse} label="Pieces" value={formatPieces(delivery.pieces)} />
        <MetaMini icon={Truck} label="Carrier" value={delivery.carrier || delivery.tracking_number || "TBD"} />
        <MetaMini icon={MapPin} label="Receive" value={delivery.receiving_location || "TBD"} />
      </div>
      <ProgressBar
        value={delivery._signals.readinessScore}
        color={riskColor(delivery._signals.risk)}
        height={4}
        sub={`${delivery._signals.readinessScore}% receiving readiness`}
      />
      {flags.length > 0 && (
        <div className="delivery-flag-row">
          {flags.slice(0, 3).map((flag) => (
            <span key={flag.key}>{flag.label}</span>
          ))}
        </div>
      )}
      <div className="delivery-card-actions" onClick={(event) => event.stopPropagation()}>
        {delivery._signals.status === "Scheduled" && (
          <button type="button" onClick={() => onSetStatus(delivery, "In Transit")}>
            Start Transit
          </button>
        )}
        {delivery._signals.status !== "Delivered" && (
          <button type="button" onClick={() => onSetStatus(delivery, "Delivered")}>
            Delivered
          </button>
        )}
      </div>
      <div className="delivery-card-project">{projectMap[delivery.project_id] || delivery.project_name || "Project TBD"}</div>
    </article>
  );
}

function MetaMini({ icon: Icon, label, value }) {
  return (
    <div className="delivery-meta-mini">
      <Icon size={12} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function ScheduleView({ metrics, filtered, projectMap, workPackageMap, onOpen }) {
  return (
    <div className="delivery-schedule">
      <div className="delivery-calendar">
        {metrics.calendarDays.map((day) => (
          <section key={day.iso} className="delivery-day">
            <div className="delivery-day-head">
              <strong>{day.label}</strong>
              <span>{day.items.length} loads - {formatTons(day.tons)}</span>
            </div>
            <div className="delivery-day-list">
              {day.items.length > 0 ? (
                day.items.map((delivery) => {
                  const wp = workPackageMap[delivery.work_package_id];
                  return (
                    <button key={delivery.id} type="button" onClick={() => onOpen(delivery)}>
                      <span style={{ background: STATUS_COLOR[delivery._signals.status] || "var(--accent)" }} />
                      <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                      <small>{delivery.vendor || "Vendor TBD"} - {formatTons(delivery.weight_tons)}</small>
                    </button>
                  );
                })
              ) : (
                <div className="delivery-day-empty">No scheduled loads</div>
              )}
            </div>
          </section>
        ))}
      </div>

      <aside className="delivery-next-loads">
        <div className="delivery-section-label">Next Up</div>
        <div className="delivery-muted">Sorted by exception risk, then scheduled date.</div>
        {(metrics.nextLoads.length ? metrics.nextLoads : filtered.slice(0, 8)).map((delivery) => {
          const wp = workPackageMap[delivery.work_package_id];
          return (
            <button key={delivery.id} type="button" onClick={() => onOpen(delivery)}>
              <div>
                <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                <span>{projectMap[delivery.project_id] || delivery.project_name || "Project TBD"}</span>
              </div>
              <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" />
            </button>
          );
        })}
      </aside>
    </div>
  );
}

function RegisterView({
  deliveries,
  projectMap,
  workPackageMap,
  selectedIds,
  onToggle,
  onToggleAll,
  onOpen,
  onEdit,
  allSelected,
}) {
  return (
    <div className="delivery-register-wrap">
      <table className="delivery-register">
        <thead>
          <tr>
            <th>
              <input type="checkbox" checked={allSelected} onChange={(event) => onToggleAll(event.target.checked)} />
            </th>
            <th>Load</th>
            <th>Vendor</th>
            <th>Schedule</th>
            <th>Material</th>
            <th>Carrier</th>
            <th>Receiving</th>
            <th>Status</th>
            <th>Risk</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => {
            const wp = workPackageMap[delivery.work_package_id];
            return (
              <tr key={delivery.id} className={selectedIds.has(delivery.id) ? "is-selected" : ""} onClick={() => onOpen(delivery)}>
                <td onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" checked={selectedIds.has(delivery.id)} onChange={() => onToggle(delivery.id)} />
                </td>
                <td>
                  <strong>{getDeliveryDisplayName(delivery, wp)}</strong>
                  <span>{wp?.wp_number || wp?.name || projectMap[delivery.project_id] || "No work package"}</span>
                </td>
                <td>
                  <strong>{delivery.vendor || "Vendor TBD"}</strong>
                  <span>{delivery.po_number || delivery.procurement_category || "PO TBD"}</span>
                </td>
                <td>
                  <strong>{formatDate(delivery.scheduled_date)}</strong>
                  <span>Need {formatDate(delivery.required_date)}</span>
                </td>
                <td>
                  <strong>{formatTons(delivery.weight_tons)}</strong>
                  <span>{formatPieces(delivery.pieces)} pcs</span>
                </td>
                <td>
                  <strong>{delivery.carrier || "Carrier TBD"}</strong>
                  <span>{delivery.tracking_number || delivery.truck_number || "Tracking TBD"}</span>
                </td>
                <td>
                  <strong>{delivery.receiving_location || "Location TBD"}</strong>
                  <span>{delivery.received_by || "Receiver TBD"}</span>
                </td>
                <td><StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} size="xs" /></td>
                <td><StatusPill label={delivery._signals.risk} color={riskColor(delivery._signals.risk)} size="xs" /></td>
                <td onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => onEdit(delivery)}>Edit</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryDetailModal({ delivery, projectMap, workPackageMap, onClose, onEdit, onDelete, onSetStatus }) {
  if (!delivery) return null;
  const wp = workPackageMap[delivery.work_package_id];
  const title = getDeliveryDisplayName(delivery, wp);
  return (
    <div className="delivery-detail-backdrop" onClick={onClose}>
      <aside className="delivery-detail" onClick={(event) => event.stopPropagation()}>
        <div className="delivery-detail-head">
          <div>
            <div className="delivery-kicker">
              <Truck size={13} />
              {delivery.load_number || delivery.delivery_number || delivery.po_number || "Delivery"}
            </div>
            <h2 style={display}>{title}</h2>
            <p>{projectMap[delivery.project_id] || delivery.project_name || "Project TBD"}</p>
          </div>
          <button type="button" onClick={onClose}>Close</button>
        </div>

        <div className="delivery-detail-status">
          <StatusPill label={delivery._signals.status} color={STATUS_COLOR[delivery._signals.status]} />
          <StatusPill label={`${delivery._signals.readinessScore}% Ready`} color={riskColor(delivery._signals.risk)} />
          {delivery.inspection_required && <StatusPill label="Inspection" color="var(--status-warning)" />}
          {delivery.is_long_lead && <StatusPill label="Long Lead" color="var(--accent)" />}
        </div>

        {delivery._signals.flags.length > 0 && (
          <div className="delivery-detail-flags">
            {delivery._signals.flags.map((flag) => (
              <span key={flag.key}>{flag.label}</span>
            ))}
          </div>
        )}

        <div className="delivery-detail-grid">
          <DetailCell label="Vendor" value={delivery.vendor} />
          <DetailCell label="PO / Load" value={delivery.po_number || delivery.load_number} />
          <DetailCell label="Work Package" value={wp?.wp_number || wp?.name} />
          <DetailCell label="Scheduled" value={formatDate(delivery.scheduled_date)} />
          <DetailCell label="Required" value={formatDate(delivery.required_date)} />
          <DetailCell label="Actual" value={formatDate(delivery.actual_date, "Not received")} />
          <DetailCell label="Pieces" value={formatPieces(delivery.pieces)} />
          <DetailCell label="Weight" value={formatTons(delivery.weight_tons)} />
          <DetailCell label="Carrier" value={delivery.carrier} />
          <DetailCell label="Tracking" value={delivery.tracking_number || delivery.truck_number} />
          <DetailCell label="Receiving" value={delivery.receiving_location} />
          <DetailCell label="Received By" value={delivery.received_by} />
        </div>

        {(delivery.notes || delivery.special_instructions || delivery.shipping_ticket_name) && (
          <div className="delivery-detail-notes">
            {delivery.special_instructions && (
              <div>
                <strong>Special Instructions</strong>
                <p>{delivery.special_instructions}</p>
              </div>
            )}
            {delivery.notes && (
              <div>
                <strong>Notes</strong>
                <p>{delivery.notes}</p>
              </div>
            )}
            {delivery.shipping_ticket_name && (
              <div>
                <strong>Shipping Ticket</strong>
                <p>{delivery.shipping_ticket_name}</p>
              </div>
            )}
          </div>
        )}

        <div className="delivery-detail-actions">
          {delivery._signals.status !== "In Transit" && delivery._signals.status !== "Delivered" && (
            <Button variant="secondary" icon="arrow" onClick={() => onSetStatus(delivery, "In Transit")}>
              In Transit
            </Button>
          )}
          {delivery._signals.status !== "Delivered" && (
            <Button variant="primary" icon="check" onClick={() => onSetStatus(delivery, "Delivered")}>
              Mark Delivered
            </Button>
          )}
          <Button variant="secondary" onClick={() => onSetStatus(delivery, "Partial")}>
            Partial
          </Button>
          <Button variant="secondary" onClick={() => onEdit(delivery)}>
            Edit
          </Button>
          <Button variant="danger" icon="x" onClick={() => onDelete(delivery)}>
            Delete
          </Button>
        </div>
      </aside>
    </div>
  );
}

function DetailCell({ label, value }) {
  return (
    <div className="delivery-detail-cell">
      <span>{label}</span>
      <strong>{value || "TBD"}</strong>
    </div>
  );
}

const deliveryStyles = `
.delivery-page {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.delivery-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.95fr);
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--bg-surface) 92%, #000 8%) 0%, color-mix(in srgb, var(--bg-surface-low) 90%, #000 10%) 100%);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 38px rgba(0,0,0,0.32);
  overflow: hidden;
}
.delivery-hero-main h1 {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 38px;
  font-weight: 600;
  line-height: 1;
}
.delivery-hero-main p {
  max-width: 720px;
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.delivery-kicker,
.delivery-section-label,
.delivery-metric-label,
.delivery-lane-title {
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.delivery-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--phase-delivery);
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--phase-delivery) 28%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--phase-delivery) 10%, transparent);
}
.delivery-hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 18px;
}
.delivery-hero-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.delivery-hero-metric {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-surface-high) 86%, #000 14%) 0%, color-mix(in srgb, var(--bg-surface-low) 92%, #000 8%) 100%);
  position: relative;
  overflow: hidden;
}
.delivery-hero-metric:before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, color-mix(in srgb, var(--metric-color) 14%, transparent), transparent 50%);
  pointer-events: none;
}
.delivery-hero-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--metric-color);
  background: color-mix(in srgb, var(--metric-color) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--metric-color) 24%, transparent);
  position: relative;
}
.delivery-metric-label,
.delivery-metric-sub,
.delivery-muted,
.delivery-card-meta,
.delivery-card-project {
  color: var(--text-muted);
}
.delivery-metric-label {
  margin-top: 12px;
}
.delivery-metric-value {
  margin-top: 8px;
  color: var(--metric-color);
  font-size: 28px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.delivery-metric-sub {
  margin-top: 6px;
  font-size: 11px;
}
.delivery-receive-panel {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(360px, 0.9fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--phase-delivery) 38%, var(--border-default));
  border-radius: 14px;
  background: color-mix(in srgb, var(--phase-delivery) 8%, var(--bg-surface));
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
}
.delivery-receive-copy h2 {
  margin: 7px 0 0;
  color: var(--text-primary);
  font-size: 22px;
  line-height: 1.15;
}
.delivery-receive-copy p {
  max-width: 720px;
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}
.delivery-receive-actions {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.delivery-receive-actions button,
.delivery-receive-list button,
.delivery-receive-exit {
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
}
.delivery-receive-actions button {
  min-height: 58px;
  padding: 9px;
  text-align: left;
}
.delivery-receive-actions span,
.delivery-receive-exit {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.delivery-receive-actions strong {
  display: block;
  margin-top: 7px;
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--phase-delivery);
}
.delivery-receive-list {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.delivery-receive-list button {
  min-height: 58px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  text-align: left;
}
.delivery-receive-list strong,
.delivery-receive-list span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-receive-list strong {
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-receive-list span,
.delivery-receive-empty {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
}
.delivery-receive-empty {
  grid-column: 1 / -1;
  padding: 14px;
  border: 1px dashed var(--border-default);
  border-radius: 10px;
  text-align: center;
}
.delivery-receive-exit {
  grid-column: 1 / -1;
  justify-self: flex-end;
  min-height: 36px;
  padding: 0 12px;
}
.delivery-flow-strip,
.delivery-toolbar,
.delivery-rail,
.delivery-main,
.delivery-lane,
.delivery-next-loads {
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--bg-surface);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
.delivery-flow-strip {
  padding: 12px;
}
.delivery-flow-header,
.delivery-rail-header,
.delivery-view-header,
.delivery-lane-head,
.delivery-day-head,
.delivery-card-top,
.delivery-watch-top,
.delivery-detail-head,
.delivery-detail-actions,
.delivery-header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.delivery-status-flow {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}
.delivery-status-step {
  min-width: 0;
  text-align: left;
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--border-default);
  border-top: 2px solid var(--step-color);
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
}
.delivery-status-step.is-active {
  border-color: var(--step-color);
  background: color-mix(in srgb, var(--step-color) 10%, var(--bg-surface-low));
}
.delivery-status-step span,
.delivery-status-step small,
.delivery-flow-total {
  display: block;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.delivery-status-step strong {
  display: block;
  margin-top: 7px;
  font-family: var(--font-mono);
  font-size: 22px;
  color: var(--step-color);
}
.delivery-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto auto auto auto;
  gap: 8px;
  padding: 10px;
  align-items: center;
}
.delivery-search,
.delivery-filter-select,
.delivery-view-toggle {
  min-width: 0;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-muted);
}
.delivery-search input,
.delivery-toolbar select,
.delivery-filter-select select {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 12px;
}
.delivery-toolbar > select {
  height: 36px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text-primary);
  padding: 0 10px;
}
.delivery-view-toggle {
  padding: 3px;
  background: var(--bg-surface-low);
}
.delivery-view-toggle button {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0 9px;
}
.delivery-view-toggle button.is-active {
  background: var(--accent);
  color: var(--accent-text);
}
.delivery-layout {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.delivery-rail,
.delivery-main {
  min-width: 0;
  padding: 12px;
}
.delivery-rail {
  position: sticky;
  top: 12px;
}
.delivery-rail-header button,
.delivery-card-actions button,
.delivery-register button,
.delivery-detail-head button {
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 6px 8px;
}
.delivery-rail-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}
.delivery-mini-stat {
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface-low);
}
.delivery-mini-stat span,
.delivery-meta-mini span,
.delivery-detail-cell span {
  display: block;
  font-family: var(--font-mono);
  font-size: 8px;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.delivery-mini-stat strong {
  display: block;
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 18px;
}
.delivery-watch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.delivery-watch-card,
.delivery-next-loads button,
.delivery-day-list button {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface-low);
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}
.delivery-watch-card {
  padding: 10px;
}
.delivery-watch-card strong,
.delivery-next-loads strong,
.delivery-day-list strong {
  display: block;
  min-width: 0;
  margin-top: 7px;
  color: var(--text-primary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-watch-card small,
.delivery-next-loads span,
.delivery-day-list small {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-rail-empty,
.delivery-lane-empty,
.delivery-day-empty {
  padding: 16px;
  border: 1px dashed var(--border-default);
  border-radius: 10px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}
.delivery-view-header {
  margin-bottom: 12px;
}
.delivery-lane-scroll {
  overflow-x: auto;
  padding-bottom: 4px;
}
.delivery-lanes {
  display: grid;
  grid-template-columns: repeat(5, minmax(250px, 1fr));
  gap: 10px;
  min-width: 980px;
}
.delivery-lane {
  min-width: 0;
  border-top: 2px solid var(--lane-color);
  padding: 10px;
}
.delivery-lane-head span {
  display: block;
  margin-top: 4px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.delivery-lane-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
.delivery-load-card {
  min-width: 0;
  padding: 11px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface-low);
  cursor: pointer;
}
.delivery-load-card.is-selected {
  border-color: var(--accent);
  background: var(--accent-muted);
}
.delivery-card-top input {
  width: 15px;
  height: 15px;
}
.delivery-card-date {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--text-muted);
}
.delivery-load-card h3 {
  margin: 10px 0 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.25;
}
.delivery-card-meta {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 10px;
  margin-bottom: 10px;
}
.delivery-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}
.delivery-meta-mini {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-surface-high) 70%, transparent);
}
.delivery-meta-mini svg {
  color: var(--phase-delivery);
  margin-top: 1px;
}
.delivery-meta-mini strong {
  display: block;
  margin-top: 3px;
  color: var(--text-primary);
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.delivery-flag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.delivery-flag-row span {
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--danger-muted);
  color: var(--status-error);
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.delivery-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.delivery-card-actions button {
  flex: 1;
}
.delivery-card-project {
  margin-top: 9px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
}
.delivery-schedule {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 12px;
}
.delivery-calendar {
  display: grid;
  grid-template-columns: repeat(7, minmax(150px, 1fr));
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}
.delivery-day {
  min-width: 150px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--bg-surface-low);
  overflow: hidden;
}
.delivery-day-head {
  align-items: flex-start;
  padding: 10px;
  border-bottom: 1px solid var(--border-default);
}
.delivery-day-head strong,
.delivery-day-head span {
  display: block;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-primary);
}
.delivery-day-head span {
  color: var(--text-muted);
  font-size: 8px;
  margin-top: 4px;
}
.delivery-day-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}
.delivery-day-list button {
  padding: 8px;
  position: relative;
}
.delivery-day-list button > span:first-child {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px;
}
.delivery-next-loads {
  padding: 12px;
}
.delivery-next-loads button {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  margin-top: 8px;
}
.delivery-register-wrap {
  overflow-x: auto;
}
.delivery-register {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
}
.delivery-register th,
.delivery-register td {
  padding: 10px 9px;
  border-bottom: 1px solid var(--border-default);
  text-align: left;
  vertical-align: middle;
}
.delivery-register th {
  background: var(--bg-surface-low);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.delivery-register tr {
  cursor: pointer;
}
.delivery-register tr.is-selected td {
  background: var(--accent-muted);
}
.delivery-register td strong,
.delivery-register td span {
  display: block;
  min-width: 0;
}
.delivery-register td strong {
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-register td span {
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 10px;
}
.delivery-empty {
  padding: 28px;
}
.delivery-detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(3, 5, 10, 0.72);
  display: flex;
  justify-content: flex-end;
}
.delivery-detail {
  width: min(520px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
  overflow-y: auto;
  border-left: 1px solid var(--border-strong);
  background: var(--bg-elevated);
  box-shadow: -18px 0 54px rgba(0,0,0,0.5);
}
.delivery-detail-head {
  align-items: flex-start;
}
.delivery-detail-head h2 {
  margin: 10px 0 6px;
  color: var(--text-primary);
  font-size: 24px;
  line-height: 1.1;
}
.delivery-detail-head p {
  margin: 0;
  color: var(--text-muted);
  font-size: 12px;
}
.delivery-detail-status,
.delivery-detail-flags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.delivery-detail-flags span {
  padding: 5px 8px;
  border-radius: 999px;
  background: var(--danger-muted);
  color: var(--status-error);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.delivery-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.delivery-detail-cell,
.delivery-detail-notes > div {
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--bg-surface);
}
.delivery-detail-cell strong {
  display: block;
  margin-top: 5px;
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-detail-notes {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.delivery-detail-notes strong {
  color: var(--text-primary);
  font-size: 12px;
}
.delivery-detail-notes p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.delivery-detail-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-default);
}
@media (max-width: 1180px) {
  .delivery-hero,
  .delivery-receive-panel,
  .delivery-layout,
  .delivery-schedule {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-rail {
    position: static;
  }
  .delivery-toolbar {
    grid-template-columns: minmax(0, 1fr) repeat(3, auto);
  }
}
@media (max-width: 760px) {
  .delivery-page {
    padding: 12px;
  }
  .delivery-hero {
    padding: 14px;
  }
  .delivery-hero-main h1 {
    font-size: 30px;
  }
  .delivery-hero-grid,
  .delivery-rail-kpis,
  .delivery-detail-grid,
  .delivery-card-grid,
  .delivery-status-flow,
  .delivery-receive-actions,
  .delivery-receive-list {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-toolbar {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-view-toggle,
  .delivery-filter-select,
  .delivery-toolbar > select {
    width: 100%;
  }
  .delivery-view-toggle button {
    flex: 1;
    justify-content: center;
  }
  .delivery-lanes {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-calendar {
    grid-template-columns: minmax(0, 1fr);
  }
  .delivery-day {
    min-width: 0;
  }
  .delivery-detail {
    width: 100vw;
  }
  .delivery-detail-actions {
    position: sticky;
    bottom: -18px;
    background: var(--bg-elevated);
  }
}
`;
