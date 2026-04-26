/**
 * Deliveries — shipment tracker, rebuilt on Claude Design system.
 *
 * Shell owns: React-Query fetches + mutations (per-row update, bulk
 * status, delete), derived counts/filters, overdue-alert background
 * effect, composition of design-system components.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useProjectId } from "@/hooks/useProjectId";
import DeliveryFormModal from "@/components/deliveries/DeliveryFormModal";
import ShippingTicketImportModal from "@/components/deliveries/ShippingTicketImportModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { batchProcess } from "@/utils/batchProcess";

import {
  CommandBar,
  KpiTile,
  PhaseChevron,
  BulkActionBar,
  EmptyState,
  Button,
  Icon,
  Modal,
  StatusPill,
} from "@/components/design-system";
import { exportDeliveriesCSV, isFabComplete } from "./deliveries/utils";
import DeliveryRowV2, { DELIVERY_GRID } from "./deliveries/DeliveryRowV2";

const PIPELINE_STAGES = [
  { id: "sched", label: "SCHEDULED",  color: "var(--status-info)"    },
  { id: "load",  label: "LOADING",    color: "var(--status-warning)" },
  { id: "trans", label: "IN TRANSIT", color: "var(--phase-delivery)" },
  { id: "del",   label: "DELIVERED",  color: "var(--status-success)" },
];

export default function Deliveries() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  /* ── Data ── */
  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () => (projectId ? base44.entities.Delivery.filter({ project_id: projectId }) : []),
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
    queryFn: () =>
      projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  const wpMap = useMemo(() => {
    const m = {};
    for (const wp of workPackages) m[wp.id] = wp.wp_number || wp.name || "";
    return m;
  }, [workPackages]);

  const projectMap = useMemo(() => {
    const m = {};
    for (const p of projects) m[p.id] = p.name || "";
    return m;
  }, [projects]);

  /* ── Mutations ── */
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
      const { succeeded, failed } = await batchProcess(ids, (id) =>
        base44.entities.Delivery.update(id, {
          status,
          actual_date: status === "Delivered" ? new Date().toISOString().split("T")[0] : null,
        })
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

  /* ── Counts + filtered ── */
  const counts = useMemo(
    () => ({
      all:       deliveries.length,
      scheduled: deliveries.filter((d) => d.status === "Scheduled").length,
      loading:   deliveries.filter((d) => d.status === "Loading").length,
      transit:   deliveries.filter((d) => d.status === "In Transit").length,
      delivered: deliveries.filter((d) => d.status === "Delivered").length,
      overdue:   deliveries.filter(
        (d) =>
          d.status !== "Delivered" &&
          d.scheduled_date &&
          new Date(d.scheduled_date) < new Date()
      ).length,
    }),
    [deliveries]
  );

  const totalInboundTons = useMemo(
    () =>
      deliveries
        .filter((d) => d.status !== "Delivered")
        .reduce((s, d) => s + (Number(d.weight_tons) || 0), 0),
    [deliveries]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (filter === "overdue") {
        if (!(d.status !== "Delivered" && d.scheduled_date && new Date(d.scheduled_date) < new Date())) {
          return false;
        }
      } else if (filter !== "all" && d.status !== filter) {
        return false;
      }
      if (!q) return true;
      return (
        (d.delivery_number || "").toLowerCase().includes(q) ||
        (d.description || "").toLowerCase().includes(q) ||
        (d.vendor || "").toLowerCase().includes(q) ||
        (d.po_number || "").toLowerCase().includes(q) ||
        (d.carrier || "").toLowerCase().includes(q)
      );
    });
  }, [deliveries, filter, search]);

  /* ── Pipeline active-stage resolver ── */
  const pipelineStages = useMemo(
    () => [
      { ...PIPELINE_STAGES[0], count: counts.scheduled },
      { ...PIPELINE_STAGES[1], count: counts.loading   },
      { ...PIPELINE_STAGES[2], count: counts.transit   },
      { ...PIPELINE_STAGES[3], count: counts.delivered },
    ],
    [counts]
  );

  const activePipelineIdx = useMemo(() => {
    if (counts.loading > 0) return 1;
    if (counts.transit > 0) return 2;
    if (counts.scheduled > 0) return 0;
    return 3;
  }, [counts]);

  /* ── Overdue → Alert effect ── */
  useEffect(() => {
    if (!deliveries.length) return;
    const createDeliveryAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "Delivery_Overdue" });
        const existingIds = new Set(existing.map((a) => a.related_record_id).filter(Boolean));
        const existingTitles = new Set(existing.map((a) => a.title));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const d of deliveries) {
          if (d.status === "Delivered") continue;
          if (!d.scheduled_date) continue;
          const sched = new Date(d.scheduled_date);
          sched.setHours(0, 0, 0, 0);
          const daysLate = Math.floor((today - sched) / 86400000);
          if (daysLate <= 0) continue;
          if (existingIds.has(d.id)) continue;
          const projectName = projectMap[d.project_id] || "";
          const desc = d.description || wpMap[d.work_package_id] || "Delivery";
          const alertTitle = `Delivery from ${d.vendor || "Unknown"} is ${daysLate}d overdue`;
          if (existingTitles.has(alertTitle)) continue;
          await base44.entities.Alert.create({
            alert_type: "Delivery_Overdue",
            severity: daysLate >= 7 ? "Critical" : daysLate >= 3 ? "High" : "Medium",
            title: alertTitle,
            description: `${desc} from ${d.vendor} · PO: ${d.po_number || "—"} · Scheduled: ${d.scheduled_date} · Status: ${d.status} · Project: ${projectName}`,
            project_id: d.project_id,
            project_name: projectName,
          });
        }
      } catch (e) {
        console.warn("Delivery alert error:", e);
      }
    };
    const t = setTimeout(createDeliveryAlerts, 4000);
    return () => clearTimeout(t);
  }, [deliveries.length, projectMap, wpMap]);

  /* ── Helpers ── */
  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleAll = (checked) =>
    setSelectedIds(checked ? new Set(filtered.map((d) => d.id)) : new Set());

  const bulkUpdate = (status) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (bulkUpdateMut.isPending) return;
    if (status === "Delivered") {
      const blocked = ids.filter((id) => {
        const d = deliveries.find((dd) => dd.id === id);
        return d && !isFabComplete(d, workPackages);
      });
      if (blocked.length > 0) {
        toast.error(
          `${blocked.length} delivery(ies) blocked — linked work package fabrication not complete`
        );
        return;
      }
    }
    bulkUpdateMut.mutate({ ids, status });
  };

  const handleProjectSelect = (val) => {
    if (val) searchParams.set("project", val);
    else searchParams.delete("project");
    setSearchParams(searchParams);
  };

  /* ── Loading ── */
  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }

  const projectName = projects.find((p) => p.id === projectId)?.name || "All Projects";

  return (
    <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <CommandBar
        eyebrow={`PRODUCTION · ${projectName.toUpperCase()}`}
        title="Deliveries"
        count={counts.all}
        unit={` · ${totalInboundTons.toFixed(1)}T INBOUND`}
        subtitle="Shipping tickets · load out · arrival signoff"
      >
        <Button
          variant="secondary"
          icon="download"
          onClick={() => exportDeliveriesCSV(filtered, projectMap, wpMap)}
        >
          CSV
        </Button>
        <Button variant="outline" icon="upload" onClick={() => setShowImport(true)}>
          IMPORT TEKLA TICKET
        </Button>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => { setEditing(null); setDetail(null); setShowForm(true); }}
        >
          SCHEDULE LOAD
        </Button>
      </CommandBar>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
        <KpiTile compact label="ALL"        value={counts.all}       color="var(--text-secondary)" active={filter === "all"}        onClick={() => setFilter("all")} />
        <KpiTile compact label="SCHEDULED"  value={counts.scheduled} color="var(--status-info)"    active={filter === "Scheduled"}  onClick={() => setFilter("Scheduled")} />
        <KpiTile compact label="LOADING"    value={counts.loading}   color="var(--status-warning)" active={filter === "Loading"}    onClick={() => setFilter("Loading")} />
        <KpiTile compact label="IN TRANSIT" value={counts.transit}   color="var(--phase-delivery)" active={filter === "In Transit"} onClick={() => setFilter("In Transit")} />
        <KpiTile compact label="DELIVERED"  value={counts.delivered} color="var(--status-success)" active={filter === "Delivered"}  onClick={() => setFilter("Delivered")} />
        <KpiTile compact label="OVERDUE"    value={counts.overdue}   color="var(--status-error)"   active={filter === "overdue"}    onClick={() => setFilter("overdue")} />
      </div>

      {/* Pipeline */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          padding: "12px 14px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            marginBottom: 8,
          }}
        >
          DELIVERY PIPELINE
        </div>
        <PhaseChevron stages={pipelineStages} activeIdx={activePipelineIdx} showIcons={false} />
      </div>

      {/* Search + project selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 420 }}>
          <div
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
            }}
          >
            <Icon name="search" size={12} />
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search DEL #, WP, vendor, PO…"
            style={{
              width: "100%",
              height: 30,
              padding: "0 12px 0 30px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              outline: "none",
            }}
          />
        </div>
        {!projectId && (
          <select
            value={projectId || ""}
            onChange={(e) => handleProjectSelect(e.target.value)}
            style={{
              height: 30,
              padding: "0 10px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-input)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
            }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <div style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            letterSpacing: "0.10em",
          }}
        >
          {filtered.length} of {deliveries.length}
        </span>
      </div>

      {/* Table */}
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-card)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: DELIVERY_GRID,
            gap: 8,
            padding: "8px 12px",
            background: "var(--bg-surface-low)",
            borderBottom: "1px solid var(--border-default)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <div>
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={(e) => toggleAll(e.target.checked)}
            />
          </div>
          <div>DEL #</div>
          <div>WP</div>
          <div>Description</div>
          <div>Scheduled</div>
          <div>Tons</div>
          <div>Pcs</div>
          <div>Truck</div>
          <div>Status</div>
          <div></div>
        </div>
        {filtered.length > 0 ? (
          filtered.map((d, i) => (
            <DeliveryRowV2
              key={d.id}
              delivery={d}
              idx={i}
              selected={selectedIds.has(d.id)}
              wpMap={wpMap}
              onToggle={() => toggleSelect(d.id)}
              onOpen={() => setDetail(d)}
            />
          ))
        ) : (
          <div style={{ padding: 24 }}>
            <EmptyState
              icon="delivery"
              title={deliveries.length === 0 ? "No shipments tracked" : "No deliveries match your filters"}
              body={
                deliveries.length === 0
                  ? "Start tracking steel deliveries, vendor shipments, and material arrivals."
                  : "Clear filters or schedule a new load."
              }
            />
          </div>
        )}
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        actions={[
          { label: "→ IN TRANSIT",    icon: "arrow",    onClick: () => bulkUpdate("In Transit") },
          { label: "MARK DELIVERED",  icon: "check",    onClick: () => bulkUpdate("Delivered") },
          { label: "PARTIAL",         icon: "alert",    onClick: () => bulkUpdate("Partial") },
          {
            label: "EXPORT",
            icon: "download",
            onClick: () =>
              exportDeliveriesCSV(
                filtered.filter((d) => selectedIds.has(d.id)),
                projectMap,
                wpMap,
                "deliveries-selected.csv"
              ),
          },
        ]}
      />

      {/* Detail Modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        eyebrow={detail ? detail.delivery_number || detail.id : ""}
        title={detail ? (detail.delivery_title || detail.description || detail.vendor || "Delivery") : ""}
        width={640}
        footer={
          detail && (
            <>
              <Button variant="ghost" onClick={() => setDetail(null)}>CLOSE</Button>
              <Button variant="secondary" icon="ai" onClick={() => { setEditing(detail); setDetail(null); }}>
                EDIT
              </Button>
              <Button
                variant="danger"
                icon="x"
                onClick={() => { setDeleteTarget(detail); setDetail(null); }}
              >
                DELETE
              </Button>
              {detail.status !== "Delivered" && (
                <Button
                  variant="primary"
                  icon="check"
                  onClick={() =>
                    transitMut.mutate({
                      id: detail.id,
                      data: {
                        status: "Delivered",
                        actual_date: new Date().toISOString().split("T")[0],
                      },
                    })
                  }
                >
                  MARK DELIVERED
                </Button>
              )}
            </>
          )
        }
      >
        {detail && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <StatusPill label={detail.status || "Scheduled"} />
              {/* StatusPill auto-colors "Critical" from STATUS_COLOR tokens — no explicit color needed */}
              {detail.priority === "Critical" && <StatusPill label="Critical" />}
              {detail.inspection_required && (
                <StatusPill label="Inspection" color="var(--status-review)" />
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {[
                ["VENDOR",         detail.vendor],
                ["PO NUMBER",      detail.po_number],
                ["CARRIER",        detail.carrier],
                ["TRACKING",       detail.tracking_number],
                ["SCHEDULED",      detail.scheduled_date],
                ["REQUIRED",       detail.required_date],
                ["ACTUAL",         detail.actual_date],
                ["PIECES",         detail.pieces],
                ["WEIGHT",         detail.weight_tons ? `${detail.weight_tons}T` : null],
                ["WORK PACKAGE",   wpMap[detail.work_package_id]],
                ["RECEIVING LOC",  detail.receiving_location],
                ["RECEIVED BY",    detail.received_by],
              ].map(([label, value]) => (
                <MetaCell key={label} label={label} value={value} />
              ))}
            </div>
            {detail.notes && (
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    color: "var(--text-muted)",
                    letterSpacing: "0.14em",
                    marginBottom: 6,
                  }}
                >
                  NOTES
                </div>
                <div
                  style={{
                    padding: "12px 14px",
                    background: "var(--bg-surface-low)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-card)",
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: "var(--text-primary)",
                  }}
                >
                  {detail.notes}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modals */}
      {showForm && <DeliveryFormModal projectId={projectId} onClose={() => setShowForm(false)} />}
      {editing && (
        <DeliveryFormModal
          projectId={editing.project_id || projectId}
          delivery={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ShippingTicketImportModal
        open={showImport}
        projectId={projectId}
        projectName={activeProject?.name}
        projects={projects}
        onClose={() => setShowImport(false)}
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

function MetaCell({ label, value }) {
  return (
    <div
      style={{
        padding: "8px 10px",
        background: "var(--bg-surface-low)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--text-muted)",
          letterSpacing: "0.14em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text-primary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.04em",
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}
