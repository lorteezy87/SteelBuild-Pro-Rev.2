/**
 * Deliveries - logistics control surface for shipping tickets, load-out,
 * in-transit tracking, receiving, and exception follow-up.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { logActivity } from "@/services/auditLogger";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { entities } from "@/api/supabaseClient";
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
import DeliveryFormModalRaw from "@/components/deliveries/DeliveryFormModal";
import ShippingTicketImportModalRaw from "@/components/deliveries/ShippingTicketImportModal";
import ShippingListImportModal from "@/components/deliveries/ShippingListImportModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import ListTruncationNotice from "@/components/shared/ListTruncationNotice";
import LoadingSkeletonRaw from "@/components/shared/LoadingSkeleton";
import { batchProcess } from "@/utils/batchProcess";
import { BulkActionBar as BulkActionBarRaw } from "@/components/design-system";
import SequenceFilterRaw, { matchesSequenceFilter } from "@/components/shared/SequenceFilter";
import { exportDeliveriesCSV, isFabComplete } from "./deliveries/utils";
import {
  buildDeliveryMetrics,
  deliveryLane,
  getDeliveryDisplayName,
  sortDeliveriesForDispatch,
} from "./deliveries/analytics";
import { LANE_ORDER, todayIso } from "./deliveries/format";
import {
  DeliveryDetailModal,
  DispatchBoard,
  ReceivingQuickPanel,
  ScheduleView,
} from "./deliveries/components";
import type { DeliveryMetrics, DeliveryRecord } from "./deliveries/types";
import DeliveryControlCenter from "./deliveries/DeliveryControlCenter";

// The design-system primitives and LoadingSkeleton are still .jsx, so TS infers
// permissive types. These casts are removable once the shared layer is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;
const LoadingSkeleton = LoadingSkeletonRaw as unknown as ComponentType<AnyProps>;
// Same boundary cast for the .jsx feature components whose default-valued props
// (e.g. `items = []`, `delivery = null`) make TS infer overly narrow prop types.
const SequenceFilter = SequenceFilterRaw as unknown as ComponentType<AnyProps>;
const DeliveryFormModal = DeliveryFormModalRaw as unknown as ComponentType<AnyProps>;
const ShippingTicketImportModal = ShippingTicketImportModalRaw as unknown as ComponentType<AnyProps>;

export default function Deliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject: activeProjectRaw } = useProjectContext();
  // ProjectContext.jsx is untyped JS, so activeProject infers as `null`/`never`.
  // Cast at the boundary to its real shape (drop once ProjectContext is typed),
  // mirroring the same boundary cast in useProjectId.ts.
  const activeProject = activeProjectRaw as { name?: string | null } | null;
  const projectId = useProjectId();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const receiveMode = searchParams.get("receive") === "1";

  const [view, setView] = useState("dispatch");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scheduleFilter, setScheduleFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [seqFilter, setSeqFilter] = useState<unknown>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showListImport, setShowListImport] = useState(false);
  const [editing, setEditing] = useState<DeliveryRecord | null>(null);
  const [detail, setDetail] = useState<DeliveryRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeliveryRecord | null>(null);

  useAutoOpenCreate(() => {
    setEditing(null);
    setDetail(null);
    setShowForm(true);
  });

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["deliveries", projectId || "all"],
    queryFn: () =>
      projectId ? entities.Delivery.filter({ project_id: projectId }) : entities.Delivery.list(),
    staleTime: 60000,
    refetchInterval: 60000,
  });

  useRealtimeInvalidation("deliveries", projectId, [["deliveries", projectId || "all"]]);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId || "all"],
    queryFn: () =>
      projectId ? entities.WorkPackage.filter({ project_id: projectId }) : entities.WorkPackage.list(),
    staleTime: 60000,
  });

  const projectMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const project of projects) map[project.id] = project.name || (project as any).project_name || "";
    return map;
  }, [projects]);

  const workPackageMap = useMemo(() => {
    const map: Record<string, Record<string, unknown>> = {};
    for (const wp of workPackages) map[wp.id] = wp;
    return map;
  }, [workPackages]);

  const wpLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
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
  // analytics.js is untyped JS; buildDeliveryMetrics over-pessimistically infers
  // `today` as Date | null (dateValue can return null) — at runtime it always
  // resolves to a real Date (todayStart falls back to new Date()). Re-typed view
  // for the .tsx components that take the canonical DeliveryMetrics shape; kept
  // separate so the loose-typed `metrics` is unchanged for the rest of this file.
  const metricsTyped = metrics as DeliveryMetrics;

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
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      entities.Delivery.update(id, data),
    onSuccess: async (updated, variables) => {
      logActivity("delivery", "status_changed", updated, { projectId });
      replaceRecordInCaches(qc, deliveryQueryKeys, updated);
      await invalidateDeliveries();
      setDetail((prev) => (prev?.id === variables.id ? null : prev));
      toast.success("Delivery status updated");
    },
    onError: (e) => toastCrudError(e, "Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => entities.Delivery.delete(id),
    onSuccess: async (_result, deletedId) => {
      logActivity("delivery", "deleted", deleteTarget || { id: deletedId, project_id: projectId }, { projectId });
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
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const { succeeded, failed } = await batchProcess(ids, (id: string) =>
        entities.Delivery.update(id, {
          status,
          actual_date: status === "Delivered" ? todayIso() : null,
        })
      );
      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`All ${failed.length} updates failed.`);
      }
      return { succeeded, failed };
    },
    onSuccess: async (results, variables) => {
      results.succeeded.forEach(({ value, item }: any) =>
        logActivity("delivery", "status_changed", value || { id: item, project_id: projectId }, { projectId, description: `→ ${variables.status}` }));
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
    const groups: Record<string, DeliveryRecord[]> = Object.fromEntries(
      LANE_ORDER.map((lane) => [lane, [] as DeliveryRecord[]])
    );
    for (const delivery of filtered) {
      const lane = deliveryLane(delivery);
      if (!groups[lane]) groups.Exceptions.push(delivery);
      else groups[lane].push(delivery);
    }
    return groups;
  }, [filtered]);

  // In-session dedup so the 60s metrics refetch doesn't re-run the alert pass
  // for deliveries already handled (the DB title/id check still backstops it).
  const alertsCreatedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!projectId || !metrics.overdue.length) return undefined;
    const createDeliveryAlerts = async () => {
      try {
        const existing = await entities.Alert.filter({ alert_type: "Delivery_Overdue" });
        const existingIds = new Set(existing.map((alert) => alert.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((alert) => alert.title));
        for (const delivery of metrics.overdue) {
          if (existingIds.has(delivery.id)) continue;
          if (alertsCreatedRef.current.has(delivery.id)) continue;
          const projectName = projectMap[delivery.project_id] || "";
          const wp = workPackageMap[delivery.work_package_id];
          const desc = getDeliveryDisplayName(delivery, wp);
          const daysLate = delivery._signals.flags.find((flag: { key?: string; label?: string }) => flag.key === "overdue")?.label || "late";
          const alertTitle = `Delivery from ${delivery.vendor || "Unknown"} is ${daysLate}`;
          if (existingTitles.has(alertTitle)) continue;
          await entities.Alert.create({
            alert_type: "Delivery_Overdue",
            severity: delivery._signals.risk === "high" ? "High" : "Medium",
            title: alertTitle,
            description: `${desc} from ${delivery.vendor || "Unknown"} - PO: ${delivery.po_number || "TBD"} - Scheduled: ${delivery.scheduled_date || "TBD"} - Status: ${delivery.status || "Scheduled"} - Project: ${projectName}`,
            related_record_id: delivery.id,
            project_id: delivery.project_id,
            project_name: projectName,
          });
          alertsCreatedRef.current.add(delivery.id);
        }
      } catch (error) {
        console.warn("Delivery alert error:", error);
      }
    };
    const timer = setTimeout(createDeliveryAlerts, 4000);
    return () => clearTimeout(timer);
  }, [metrics.overdue, projectId, projectMap, workPackageMap]);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (checked: boolean) =>
    setSelectedIds(
      checked
        ? new Set(
            filtered
              .map((delivery) => delivery.id)
              .filter((id): id is string => Boolean(id))
          )
        : new Set()
    );

  useEffect(() => {
    const visibleIds = new Set(
      filtered
        .map((delivery) => delivery.id)
        .filter((id): id is string => Boolean(id))
    );
    setSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [filtered]);

  const handleProjectSelect = (value: string) => {
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

  const setDeliveryStatus = (delivery: DeliveryRecord, status: string) => {
    if (!delivery || !delivery.id || transitMut.isPending) return;
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

  const bulkUpdate = (status: string) => {
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
      <div className="sb-dashboard-reference-page">
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projectMap[projectId ?? ""] || activeProject?.name || "All Projects";
  const selectedDeliveries = filtered.filter((delivery) => selectedIds.has(delivery.id));

  // The page owns all modal state and mutation handlers; the control center only
  // supplies the route-level presentation around these workflows.
  const modals = (
    <>
      <DeliveryDetailModal
        delivery={detail}
        projectMap={projectMap}
        workPackageMap={workPackageMap}
        onClose={() => setDetail(null)}
        onEdit={can("edit", "delivery") ? (delivery: DeliveryRecord) => {
          setEditing(delivery);
          setDetail(null);
        } : null}
        onDelete={can("delete", "delivery") ? (delivery: DeliveryRecord) => {
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
        onCreated={() => invalidateDeliveries()}
        onClose={() => {
          setShowImport(false);
          invalidateDeliveries();
        }}
      />
      <ShippingListImportModal
        open={showListImport}
        projectId={projectId}
        projectName={activeProject?.name}
        onImported={() => invalidateDeliveries()}
        onClose={() => {
          setShowListImport(false);
          invalidateDeliveries();
        }}
      />
      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && deleteMut.mutate(deleteTarget.id)}
        title="Delete delivery?"
        description="This delivery will be removed."
      />
    </>
  );

  return (
    <div className="delivery-page">
      <DeliveryControlCenter
        projectName={projectName}
        projectId={projectId}
        projectOptions={projects}
        onProjectChange={handleProjectSelect}
        deliveries={activeDeliveries}
        filtered={filtered}
        metrics={metricsTyped}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        scheduleFilter={scheduleFilter}
        onScheduleFilterChange={setScheduleFilter}
        riskFilter={riskFilter}
        onRiskFilterChange={setRiskFilter}
        view={view}
        onViewChange={setView}
        onOpenDelivery={setDetail}
        onExport={() => exportDeliveriesCSV(filtered, projectMap, wpLabelMap)}
        onImport={can("create", "delivery") ? () => setShowImport(true) : null}
        onImportList={can("create", "delivery") ? () => setShowListImport(true) : null}
        onCreate={can("create", "delivery") ? () => { setEditing(null); setDetail(null); setShowForm(true); } : null}
        onClearFilters={() => {
          setStatusFilter("all");
          setScheduleFilter("all");
          setRiskFilter("all");
          setSeqFilter(null);
          setSearch("");
        }}
        sequenceFilter={<SequenceFilter items={activeDeliveries} value={seqFilter} onChange={setSeqFilter} />}
        truncationNotice={<ListTruncationNotice count={deliveries.length} label="deliveries" />}
        receivingPanel={receiveMode ? (
          <ReceivingQuickPanel
            metrics={metricsTyped}
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
        ) : null}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleAll}
        dispatchBoard={
          <DispatchBoard
            laneGroups={laneGroups}
            projectMap={projectMap}
            workPackageMap={workPackageMap}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onOpen={setDetail}
            onSetStatus={setDeliveryStatus}
          />
        }
        scheduleView={
          <ScheduleView
            metrics={metricsTyped}
            filtered={filtered}
            projectMap={projectMap}
            workPackageMap={workPackageMap}
            onOpen={setDetail}
          />
        }
      />
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
      {modals}
    </div>
  );
}
