/**
 * Deliveries — shipment tracker for steel fab/erection projects.
 *
 * After the carve-up this shell owns only:
 *   1. React-Query wiring (deliveries, projects, workPackages).
 *   2. Mutations: per-row quick-advance, per-row status set,
 *      delete, bulk-status update.
 *   3. Derived data (projectMap, wpMap, filtered/grouped rows, KPIs,
 *      day/timeline arrays).
 *   4. The "overdue delivery → Alert" background effect.
 *   5. Composition of feature-folder components in `./deliveries/`.
 *
 * Visual blocks all live under `src/pages/deliveries/`:
 *   CommandBar, KpiStrip, AlertBanner, FilterBar, LookaheadPanel,
 *   DeliveryRow + ProjectGroup, TimelineView, DetailDrawer,
 *   BulkActionBar, EmptyState.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import DeliveryFormModal from "@/components/deliveries/DeliveryFormModal";
import ShippingTicketImportModal from "@/components/deliveries/ShippingTicketImportModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { batchProcess } from "@/utils/batchProcess";

import { exportDeliveriesCSV, isFabComplete } from "./deliveries/utils";
import CommandBar    from "./deliveries/CommandBar";
import KpiStrip      from "./deliveries/KpiStrip";
import AlertBanner   from "./deliveries/AlertBanner";
import FilterBar     from "./deliveries/FilterBar";
import LookaheadPanel from "./deliveries/LookaheadPanel";
import { DeliveryRow, ProjectGroup, DELIVERY_GRID } from "./deliveries/DeliveryRow";
import TimelineView  from "./deliveries/TimelineView";
import DetailDrawer  from "./deliveries/DetailDrawer";
import BulkActionBar from "./deliveries/BulkActionBar";
import EmptyState    from "./deliveries/EmptyState";

export default function Deliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const qc = useQueryClient();

  const [view, setView] = useState("TABLE");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("DUE");
  const [overdueFirst, setOverdueFirst] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* ── Mutations ── */
  const quickCompleteMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Delivery.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      toast.success("Delivery marked delivered");
    },
    onError: () => toast.error("Update failed"),
  });

  const transitMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Delivery.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Update failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Delivery.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      if (detail?.id === deleteTarget?.id) setDetail(null);
      if (editing?.id === deleteTarget?.id) setEditing(null);
      setDeleteTarget(null);
      toast.success("Delivery removed");
    },
    onError: () => toast.error("Delete failed"),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, status }) => {
      const { succeeded, failed } = await batchProcess(
        ids,
        (id) => base44.entities.Delivery.update(id, {
          status,
          actual_date: status === "Delivered" ? new Date().toISOString().split("T")[0] : null,
        }),
      );
      if (failed.length > 0 && succeeded.length === 0) {
        throw new Error(`All ${failed.length} updates failed.`);
      }
      return { succeeded, failed };
    },
    onSuccess: (results) => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      setSelectedIds(new Set());
      if (results.failed.length > 0) {
        toast.warning(`${results.succeeded.length} updated, ${results.failed.length} failed`);
      } else {
        toast.success("Deliveries updated");
      }
    },
    onError: () => toast.error("Bulk update failed"),
  });

  /* ── Queries ── */
  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () => base44.entities.Delivery.filter({ project_id: projectId }),
    enabled: !!projectId,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => (projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : Promise.resolve([])),
    enabled: !!projectId,
  });

  /* ── Lookup maps ── */
  const projectMap = useMemo(() => {
    const map = {};
    for (const p of projects) map[p.id] = p.name || p.project_name || "";
    return map;
  }, [projects]);

  const wpMap = useMemo(() => {
    const map = {};
    for (const wp of workPackages) map[wp.id] = wp.name || wp.wp_number || "";
    return map;
  }, [workPackages]);

  const projectCount = useMemo(() => {
    const ids = new Set(deliveries.map((d) => d.project_id));
    return ids.size;
  }, [deliveries]);

  /* ── Date anchors ── */
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const in7 = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);
  const in30 = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d;
  }, [today]);

  /* ── Filter + sort ── */
  const filtered = useMemo(() => {
    return deliveries
      .filter((d) => {
        if (filterStatus !== "ALL" && d.status !== filterStatus) return false;
        const q = search.trim().toLowerCase();
        if (q.length) {
          const hay =
            `${d.description || ""} ${wpMap[d.work_package_id] || ""} ${d.vendor || ""} ${d.po_number || ""} ${projectMap[d.project_id] || ""} ${d.carrier || ""} ${d.tracking_number || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDate = a.scheduled_date ? new Date(a.scheduled_date) : null;
        const bDate = b.scheduled_date ? new Date(b.scheduled_date) : null;
        if (overdueFirst) {
          const aOver = aDate && aDate < today && a.status !== "Delivered";
          const bOver = bDate && bDate < today && b.status !== "Delivered";
          if (aOver && !bOver) return -1;
          if (!aOver && bOver) return 1;
        }
        if (sortBy === "PROJECT") {
          return (projectMap[a.project_id] || "").localeCompare(projectMap[b.project_id] || "");
        }
        if (sortBy === "VENDOR") {
          return (a.vendor || "").localeCompare(b.vendor || "");
        }
        if (sortBy === "TONNAGE") {
          return (Number(b.weight_tons) || 0) - (Number(a.weight_tons) || 0);
        }
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
      });
  }, [deliveries, filterStatus, search, sortBy, overdueFirst, today, projectMap, wpMap]);

  const grouped = useMemo(() => {
    if (projectId) return null;
    return filtered.reduce((acc, d) => {
      const key = projectMap[d.project_id] || "Unassigned";
      acc[key] = acc[key] || [];
      acc[key].push(d);
      return acc;
    }, {});
  }, [filtered, projectId, projectMap]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const scheduled = deliveries.filter((d) => d.status === "Scheduled").length;
    const inTransit = deliveries.filter((d) => d.status === "In Transit").length;
    const delivered = deliveries.filter((d) => d.status === "Delivered").length;
    const partial = deliveries.filter((d) => ["Partial", "Rejected"].includes(d.status)).length;
    const overdue = deliveries.filter(
      (d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered"
    ).length;
    const dueWeek = deliveries.filter((d) => {
      if (!d.scheduled_date) return false;
      const dt = new Date(d.scheduled_date);
      return dt >= today && dt <= in7 && d.status !== "Delivered";
    }).length;
    const dueMonth = deliveries.filter((d) => {
      if (!d.scheduled_date) return false;
      const dt = new Date(d.scheduled_date);
      return dt >= today && dt <= in30 && d.status !== "Delivered";
    }).length;
    const tonsPending = deliveries
      .filter((d) => d.status !== "Delivered")
      .reduce((s, d) => s + (Number(d.weight_tons) || 0), 0)
      .toFixed(1);
    return { scheduled, inTransit, delivered, partial, overdue, dueWeek, dueMonth, tonsPending };
  }, [deliveries, today, in7, in30]);

  /* ── Overdue → Alert background effect ── */
  useEffect(() => {
    if (!deliveries.length) return;
    const createDeliveryAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "Delivery_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((a) => a.title));
        const todayZero = new Date();
        todayZero.setHours(0, 0, 0, 0);
        for (const d of deliveries) {
          if (d.status === "Delivered") continue;
          if (!d.scheduled_date) continue;
          const sched = new Date(d.scheduled_date);
          sched.setHours(0, 0, 0, 0);
          const daysLate = Math.floor((todayZero - sched) / 86400000);
          if (daysLate <= 0) continue;
          if (existingIds.has(d.id)) continue;
          const liveProjectName = projectMap[d.project_id] || "";
          const liveDesc = d.description || wpMap[d.work_package_id] || "Delivery";
          const alertTitle = `Delivery from ${d.vendor} is ${daysLate}d overdue`;
          if (existingTitles.has(alertTitle)) continue;
          await base44.entities.Alert.create({
            alert_type: "Delivery_Overdue",
            severity: daysLate >= 7 ? "Critical" : daysLate >= 3 ? "High" : "Medium",
            title: alertTitle,
            description: `${liveDesc} from ${d.vendor} · PO: ${d.po_number || "—"} · Scheduled: ${d.scheduled_date} · Status: ${d.status} · Project: ${liveProjectName || "—"}`,
            project_id: d.project_id,
            project_name: liveProjectName,
          });
        }
      } catch (e) {
        console.warn("Delivery alert error:", e);
      }
    };
    const t = setTimeout(createDeliveryAlerts, 4000);
    return () => clearTimeout(t);
  }, [deliveries.length, projectMap, wpMap]);

  /* ── Handlers ── */
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const bulkUpdate = (status) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (bulkUpdateMut.isPending) return;
    // Guard: cannot bulk-mark "Delivered" if any linked WPs have incomplete fab
    if (status === "Delivered") {
      const blocked = ids.filter((id) => {
        const d = deliveries.find((dd) => dd.id === id);
        return d && !isFabComplete(d, workPackages);
      });
      if (blocked.length > 0) {
        toast.error(`${blocked.length} delivery(ies) blocked — linked work package fabrication not complete`);
        return;
      }
    }
    bulkUpdateMut.mutate({ ids, status });
  };

  const handleAdvanceStatus = (delivery) => {
    if (delivery.status === "Scheduled") {
      transitMut.mutate({ id: delivery.id, data: { status: "In Transit" } });
    } else if (delivery.status === "In Transit") {
      if (!isFabComplete(delivery, workPackages)) {
        const wp = workPackages.find((w) => w.id === delivery.work_package_id);
        toast.error(`Cannot mark delivered — WP "${wp?.name || "linked"}" fabrication is not complete`);
        return;
      }
      quickCompleteMut.mutate({
        id: delivery.id,
        data: { status: "Delivered", actual_date: new Date().toISOString().split("T")[0] },
      });
    } else {
      setEditing(delivery);
    }
  };

  const handleProjectSelect = (val) => {
    if (val) {
      searchParams.set("project", val);
    } else {
      searchParams.delete("project");
    }
    setSearchParams(searchParams);
  };

  /* ── Date arrays for lookahead / timeline ── */
  const dayList = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        d.setHours(0, 0, 0, 0);
        return d;
      }),
    [today]
  );

  const timelineDays = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        d.setHours(0, 0, 0, 0);
        return d;
      }),
    [today]
  );

  /* ── Rendered overdue list used by AlertBanner ── */
  const overdueList = useMemo(
    () =>
      deliveries.filter(
        (d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered"
      ),
    [deliveries, today]
  );

  /* ── Row props passed to DeliveryRow / ProjectGroup ── */
  const rowProps = {
    today,
    projectMap,
    wpMap,
    selectedIds,
    onToggleSelect: toggleSelect,
    onAdvanceStatus: handleAdvanceStatus,
    onEdit: setEditing,
    onOpenDetail: setDetail,
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-page)" }}>
      <CommandBar
        deliveryCount={deliveries.length}
        projectCount={projectCount}
        view={view}
        onViewChange={setView}
        onExportAll={() => exportDeliveriesCSV(deliveries, projectMap, wpMap)}
        onImport={() => setShowImport(true)}
        onNew={() => { setEditing(null); setDetail(null); setShowForm(true); }}
      />

      <KpiStrip kpis={kpis} filterStatus={filterStatus} onFilterChange={setFilterStatus} />

      <AlertBanner
        visible={kpis.overdue > 0 || kpis.partial > 0}
        overdueDeliveries={overdueList}
        wpMap={wpMap}
        projectMap={projectMap}
        today={today}
        onChipClick={(d) => setSearch(projectMap[d.project_id] || "")}
      />

      <FilterBar
        search={search} onSearchChange={setSearch}
        projectId={projectId} projects={projects} onProjectChange={handleProjectSelect}
        filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
        sortBy={sortBy} onSortByChange={setSortBy}
        overdueFirst={overdueFirst} onToggleOverdueFirst={() => setOverdueFirst((v) => !v)}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <LookaheadPanel
          deliveries={deliveries}
          projectMap={projectMap}
          wpMap={wpMap}
          today={today}
          in7={in7}
          in30={in30}
          dayList={dayList}
          hidden={deliveries.length === 0}
          onSelect={setDetail}
        />

        <div style={{ flex: 1, overflowY: "auto", position: "relative", background: "var(--bg-page)" }}>
          {deliveries.length === 0 ? (
            <EmptyState onCreate={() => { setEditing(null); setDetail(null); setShowForm(true); }} />
          ) : view === "TABLE" ? (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  display: "grid",
                  gridTemplateColumns: DELIVERY_GRID,
                  background: "var(--bg-sidebar)",
                  borderBottom: "1px solid var(--divider)",
                  padding: "10px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 8,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                }}
              >
                <div> </div>
                <div>Status</div>
                <div>Project</div>
                <div>Delivery Title</div>
                <div>Vendor</div>
                <div>PO #</div>
                <div>Sched</div>
                <div>Actual</div>
                <div>Tons</div>
                <div>Required</div>
                <div>Actions</div>
              </div>
              {projectId
                ? filtered.map((d) => <DeliveryRow key={d.id} delivery={d} {...rowProps} />)
                : Object.entries(grouped || {}).map(([name, list]) => (
                    <ProjectGroup
                      key={name}
                      name={name}
                      list={list}
                      today={today}
                      collapsed={collapsedProjects[name]}
                      onToggleCollapse={(n) => setCollapsedProjects((p) => ({ ...p, [n]: !p[n] }))}
                      rowProps={rowProps}
                    />
                  ))}
            </div>
          ) : (
            <TimelineView
              projectId={projectId}
              projectMap={projectMap}
              wpMap={wpMap}
              filtered={filtered}
              grouped={grouped}
              timelineDays={timelineDays}
              today={today}
              onSelect={setDetail}
            />
          )}
        </div>
      </div>

      <BulkActionBar
        count={selectedIds.size}
        isPending={bulkUpdateMut.isPending}
        onSetStatus={bulkUpdate}
        onExport={() => exportDeliveriesCSV(
          deliveries.filter((d) => selectedIds.has(d.id)),
          projectMap,
          wpMap,
          "deliveries-selected.csv"
        )}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Modals */}
      {showForm && <DeliveryFormModal projectId={projectId} onClose={() => setShowForm(false)} />}
      <ShippingTicketImportModal
        open={showImport}
        projectId={projectId}
        projectName={activeProject?.name}
        projects={projects}
        onClose={() => setShowImport(false)}
      />
      {editing && <DeliveryFormModal projectId={editing.project_id || projectId} delivery={editing} onClose={() => setEditing(null)} />}

      <DetailDrawer
        detail={detail}
        projectMap={projectMap}
        wpMap={wpMap}
        today={today}
        onClose={() => setDetail(null)}
        onAdvanceToStatus={(s) => {
          transitMut.mutate({
            id: detail.id,
            data: {
              status: s,
              actual_date: s === "Delivered" ? new Date().toISOString().split("T")[0] : detail.actual_date,
            },
          });
        }}
        onEdit={() => { setEditing(detail); setDetail(null); }}
        onDelete={() => setDeleteTarget(detail)}
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
