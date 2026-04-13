import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import DeliveryFormModal from "@/components/deliveries/DeliveryFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { batchProcess } from "@/utils/batchProcess";

const STATUS_COLORS = {
  Scheduled: { bg: "rgba(234,179,8,0.18)", text: "var(--status-warning)", border: "var(--status-warning)" },
  "In Transit": { bg: "rgba(0,229,255,0.06)", text: "var(--status-info)", border: "var(--status-info)" },
  Delivered: { bg: "rgba(34,197,94,0.18)", text: "var(--status-success)", border: "var(--status-success)" },
  Partial: { bg: "rgba(251,146,60,0.20)", text: "var(--status-warning)", border: "var(--status-warning)" },
  Rejected: { bg: "rgba(239,68,68,0.20)", text: "var(--status-error)", border: "var(--status-error)" },
};

const statusList = ["Scheduled", "In Transit", "Delivered", "Partial", "Rejected"];

function exportToCSV(deliveries, projectMap = {}, wpMap = {}, filename = "deliveries.csv") {
  const headers = [
    "Project",
    "Delivery Title",
    "Work Package",
    "Vendor",
    "PO Number",
    "Carrier",
    "Tracking",
    "Status",
    "Scheduled Date",
    "Required Date",
    "Actual Date",
    "Pieces",
    "Weight (Tons)",
    "Priority",
    "Receiving Location",
    "Received By",
    "Notes",
  ];
  const rows = deliveries.map((d) => [
    projectMap[d.project_id] || "",
    d.description || "",
    wpMap[d.work_package_id] || "",
    d.vendor || "",
    d.po_number || "",
    d.carrier || "",
    d.tracking_number || "",
    d.status || "",
    d.scheduled_date || "",
    d.required_date || "",
    d.actual_date || "",
    d.pieces || "",
    d.weight_tons || "",
    d.priority || "Normal",
    d.receiving_location || "",
    d.received_by || "",
    (d.notes || "").replace(/,/g, ";"),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [collapsedProjects, setCollapsedProjects] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    queryFn: () => projectId ? base44.entities.WorkPackage.filter({ project_id: projectId }) : Promise.resolve([]),
    enabled: !!projectId,
  });

  // Lookup maps: resolve project_id → name, work_package_id → name at display time
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

  useEffect(() => {
    if (!deliveries.length) return;
    const createDeliveryAlerts = async () => {
      try {
        const existing = await base44.entities.Alert.filter({ alert_type: "Delivery_Overdue" });
        // related_record_id may not exist yet — fall back to title-based dedup
        const existingIds = new Set(
          existing.map((a) => a.related_record_id).filter(Boolean)
        );
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
            description: `${liveDesc} from ${d.vendor} · PO: ${d.po_number || "—"} · Scheduled: ${
              d.scheduled_date
            } · Status: ${d.status} · Project: ${liveProjectName || "—"}`,
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

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkUpdate = (status) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (bulkUpdateMut.isPending) return;
    // Guard: cannot bulk-mark "Delivered" if any linked WPs have incomplete fab
    if (status === "Delivered") {
      const blocked = ids.filter(id => {
        const d = deliveries.find(dd => dd.id === id);
        return d && !isFabComplete(d);
      });
      if (blocked.length > 0) {
        toast.error(`${blocked.length} delivery(ies) blocked — linked work package fabrication not complete`);
        return;
      }
    }
    bulkUpdateMut.mutate({ ids, status });
  };

  // Check if the linked work package's fabrication is complete
  const isFabComplete = (delivery) => {
    if (!delivery.work_package_id) return true; // no WP linked — allow
    const wp = workPackages.find(w => w.id === delivery.work_package_id);
    if (!wp) return true; // WP not found (deleted?) — allow
    const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
    const rank = PHASE_RANK[wp.phase] ?? 0;
    // Fab is done if WP has moved past Fabrication (Delivery/Erection)
    // OR is in Fabrication with status "Complete"
    if (rank >= 2) return true;
    if (rank === 1 && wp.status === "Complete") return true;
    return false;
  };

  const handleAdvanceStatus = (delivery) => {
    if (delivery.status === "Scheduled") {
      transitMut.mutate({ id: delivery.id, data: { status: "In Transit" } });
    } else if (delivery.status === "In Transit") {
      if (!isFabComplete(delivery)) {
        const wp = workPackages.find(w => w.id === delivery.work_package_id);
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

  const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const renderStatusPill = (status) => {
    const colors = STATUS_COLORS[status] || STATUS_COLORS.Scheduled;
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 2,
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: "0.08em",
          background: colors.bg,
          color: colors.text,
          textTransform: "uppercase",
        }}
      >
        {status}
      </span>
    );
  };

  const renderRow = (delivery) => {
    const overdue = delivery.scheduled_date && new Date(delivery.scheduled_date) < today && delivery.status !== "Delivered";
    const colors = STATUS_COLORS[delivery.status] || STATUS_COLORS.Scheduled;
    return (
      <div
        key={delivery.id}
        style={{
          display: "grid",
          gridTemplateColumns: "28px 100px 150px 2fr 140px 100px 90px 90px 72px 90px 110px",
          padding: "10px 12px",
          borderBottom: "1px solid var(--divider)",
          alignItems: "center",
          background: overdue ? "rgba(239,68,68,0.06)" : "transparent",
          borderLeft: `3px solid ${overdue ? "var(--status-error)" : colors.border}`,
          cursor: "pointer",
        }}
        onClick={(e) => {
          if (e.target.dataset?.action === "button" || e.target.type === "checkbox") return;
          setDetail(delivery);
        }}
      >
        <input type="checkbox" checked={selectedIds.has(delivery.id)} onChange={() => toggleSelect(delivery.id)} style={{ width: 16, height: 16 }} />
        <div>{renderStatusPill(delivery.status)}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {projectMap[delivery.project_id] || "—"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
            {delivery.description || "—"}
            {delivery.priority === "Critical" && <span style={{ color: "var(--status-error)", marginLeft: 6 }}>FLAG</span>}
            {delivery.inspection_required && <span style={{ color: "var(--status-warning)", marginLeft: 6 }}>INSPECT</span>}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
            {wpMap[delivery.work_package_id] || "—"}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
          {delivery.vendor}
          {delivery.carrier && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{delivery.carrier}</div>
          )}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delivery.po_number ? "var(--accent)" : "var(--text-muted)" }}>
          {delivery.po_number || "—"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: overdue ? "var(--status-error)" : "var(--text-secondary)", fontWeight: overdue ? 700 : 400 }}>
          {delivery.scheduled_date ? new Date(delivery.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
          {overdue && <div style={{ fontSize: 8 }}>Late</div>}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delivery.actual_date ? "var(--status-success)" : "var(--text-muted)" }}>
          {delivery.actual_date ? new Date(delivery.actual_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
          {(delivery.weight_tons || 0) + "T"}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: delivery.required_date ? "var(--text-secondary)" : "var(--text-muted)" }}>
          {delivery.required_date ? new Date(delivery.required_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            data-action="button"
            onClick={(e) => {
              e.stopPropagation();
              handleAdvanceStatus(delivery);
            }}
            style={{
              height: 26,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 9,
            }}
          >
            {delivery.status === "Scheduled" ? "→ Transit" : delivery.status === "In Transit" ? "✓ Deliver" : "Edit"}
          </button>
          <button
            data-action="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(delivery);
            }}
            style={{
              height: 26,
              width: 32,
              borderRadius: 6,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              cursor: "pointer",
            }}
            title="Edit"
          >
            ✎
          </button>
        </div>
      </div>
    );
  };

  const renderProjectGroup = (name, list) => {
    const collapsed = collapsedProjects[name];
    const overdueCount = list.filter(
      (d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered"
    ).length;
    const totalTons = list.reduce((s, d) => s + (Number(d.weight_tons) || 0), 0).toFixed(1);
    return (
      <div key={name}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: "var(--bg-sidebar)",
            borderBottom: "1px solid var(--divider)",
            cursor: "pointer",
          }}
          onClick={() => setCollapsedProjects((p) => ({ ...p, [name]: !p[name] }))}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>{collapsed ? "▸" : "▾"}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>{name}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{list.length} deliveries</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)" }}>{totalTons}T</span>
          {overdueCount > 0 && (
            <span style={{ marginLeft: "auto", background: "var(--status-error)", color: "#fff", padding: "2px 6px", borderRadius: 3, fontSize: 9, fontFamily: "var(--font-mono)" }}>
              {overdueCount} overdue
            </span>
          )}
        </div>
        {!collapsed && list.map(renderRow)}
      </div>
    );
  };

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

  const TimelineView = () => (
    <div style={{ position: "relative", overflow: "auto", padding: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: `150px repeat(${timelineDays.length}, 48px)`, gap: 2, alignItems: "stretch" }}>
        <div />
        {timelineDays.map((d, i) => (
          <div key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", textAlign: "center" }}>
            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        ))}
        {(projectId ? [{ name: projectMap[projectId] || "—", list: filtered }] : Object.entries(grouped || {}).map(([name, list]) => ({ name, list }))).map((grp) => (
          <React.Fragment key={grp.name}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)" }}>{grp.name}</div>
            {timelineDays.map((day, idx) => {
              const dayDeliveries = grp.list.filter((d) => d.scheduled_date && isSameDay(new Date(d.scheduled_date), day));
              return (
                <div key={idx} style={{ position: "relative", minHeight: 38, border: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
                  {dayDeliveries.map((d, i2) => {
                    const colors = STATUS_COLORS[d.status] || STATUS_COLORS.Scheduled;
                    return (
                      <div
                        key={d.id}
                        title={`${d.description || wpMap[d.work_package_id] || d.vendor} · ${d.vendor}`}
                        style={{
                          position: "absolute",
                          top: 2 + i2 * 14,
                          left: 2,
                          right: 2,
                          height: 12,
                          background: colors.bg,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 3,
                          fontSize: 9,
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          textOverflow: "ellipsis",
                          padding: "0 4px",
                          color: colors.text,
                          cursor: "pointer",
                        }}
                        onClick={() => setDetail(d)}
                      >
                        {d.vendor} · {(d.weight_tons || 0) + "T"}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `calc(150px + ${timelineDays.findIndex((d) => isSameDay(d, today)) * 50}px)`,
          bottom: 0,
          width: 2,
          background: "var(--status-error)",
          pointerEvents: "none",
        }}
      />
    </div>
  );

  const DetailDrawer = () => {
    if (!detail) return null;
    const overdue = detail.scheduled_date && new Date(detail.scheduled_date) < today && detail.status !== "Delivered";
    const issueFlag =
      detail.notes &&
      ["damage", "short", "missing", "rejected", "issue", "problem"].some((word) =>
        detail.notes.toLowerCase().includes(word)
      );
    return (
      <>
        <div onClick={() => setDetail(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 900 }} />
        <div
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 400,
            background: "var(--bg-surface)",
            borderLeft: "1px solid var(--border-default)",
            zIndex: 901,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: "1px solid var(--divider)",
              background: "var(--bg-sidebar)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {renderStatusPill(detail.status)}
            <div style={{ fontFamily: "Space Grotesk", fontSize: 15, fontWeight: 800 }}>{detail.description || detail.vendor}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)" }}>{projectMap[detail.project_id] || "—"}</div>
            {detail.description && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{detail.vendor}</div>}
            {detail.work_package_id && wpMap[detail.work_package_id] && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }}>WP: {wpMap[detail.work_package_id]}</div>
            )}
            {overdue && (
              <div style={{ background: "var(--status-error)", color: "#fff", padding: "4px 8px", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 10 }}>
                Overdue
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <Section title="Shipment Details">
              <GridRow label="PO Number" value={detail.po_number || "—"} />
              <GridRow label="Carrier" value={detail.carrier || "—"} />
              <GridRow
                label="Tracking"
                value={detail.tracking_number || "—"}
                action={detail.tracking_number ? () => window.open(`https://www.google.com/search?q=${detail.tracking_number}`, "_blank") : null}
                actionLabel="Track"
              />
              <GridRow label="Work Package" value={wpMap[detail.work_package_id] || "—"} />
              <GridRow label="Scheduled Date" value={detail.scheduled_date || "—"} />
              <GridRow label="Required Date" value={detail.required_date || "—"} />
              <GridRow label="Actual Date" value={detail.actual_date || "—"} />
              <GridRow label="Pieces" value={detail.pieces || "—"} />
              <GridRow label="Weight (Tons)" value={detail.weight_tons || "—"} />
              <GridRow label="Received By" value={detail.received_by || "—"} />
              <GridRow label="Delivery Type" value={detail.delivery_type || "—"} />
              <GridRow label="Receiving Location" value={detail.receiving_location || "—"} />
              <GridRow label="Priority" value={detail.priority || "Normal"} />
              <GridRow label="Inspection Required" value={detail.inspection_required ? "Yes" : "No"} />
            </Section>

            <Section title="Work Package">
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>{wpMap[detail.work_package_id] || "—"}</div>
            </Section>

            <Section title="Notes / Issues">
              {issueFlag && (
                <div style={{ background: "rgba(234,179,8,0.18)", border: "1px solid rgba(234,179,8,0.4)", padding: 8, borderRadius: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-warning)" }}>
                  ISSUE FLAGGED IN NOTES
                </div>
              )}
              <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)" }}>{detail.notes || "—"}</div>
              {detail.special_instructions && (
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: "var(--text-primary)" }}>
                  Special Instructions: {detail.special_instructions}
                </div>
              )}
            </Section>
          </div>

          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--divider)", background: "var(--bg-sidebar)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {statusList.map((s) => (
              <button
                key={s}
                onClick={() =>
                  transitMut.mutate({
                    id: detail.id,
                    data: { status: s, actual_date: s === "Delivered" ? new Date().toISOString().split("T")[0] : detail.actual_date },
                  })
                }
                style={{
                  flex: "1 1 45%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--divider)",
                  background: detail.status === s ? "var(--accent)" : "var(--bg-surface)",
                  color: detail.status === s ? "var(--accent-text)" : "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => {
                setEditing(detail);
                setDetail(null);
              }}
              style={{
                flex: "1 1 100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--divider)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              Edit Full Details
            </button>
            <button
              onClick={() => setDeleteTarget(detail)}
              style={{
                flex: "1 1 100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--danger-border)",
                background: "var(--danger-muted)",
                color: "var(--status-error)",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-page)" }}>
      {/* Command bar */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          background: "var(--bg-sidebar)",
          borderBottom: "1px solid var(--divider)",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800, letterSpacing: "0.06em", color: "var(--text-primary)", textTransform: "uppercase" }}>Deliveries</div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", background: "var(--bg-surface-high)", border: "1px solid var(--border-default)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.12em" }}>
            {deliveries.length} SHIPMENTS · {projectCount} PROJECTS
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", border: "1px solid var(--divider)", borderRadius: 8, overflow: "hidden" }}>
            {["TABLE", "TIMELINE"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "8px 12px",
                  border: "none",
                  background: view === v ? "var(--accent)" : "transparent",
                  color: view === v ? "var(--accent-text)" : "var(--text-primary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportToCSV(deliveries, projectMap, wpMap)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Export All
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setDetail(null);
              setShowForm(true);
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "var(--accent-text)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            + New Delivery
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--divider)", display: "flex", flexShrink: 0, overflowX: "auto" }}>
        {[
          { label: "SCHEDULED",      value: kpis.scheduled,           tone: "warning", status: "Scheduled"  },
          { label: "IN TRANSIT",     value: kpis.inTransit,           tone: "info",    status: "In Transit" },
          { label: "DELIVERED",      value: kpis.delivered,           tone: "success", status: "Delivered"  },
          { label: "PARTIAL/ISSUES", value: kpis.partial,             tone: "error",   status: "Partial"    },
          { label: "OVERDUE",        value: kpis.overdue,             tone: kpis.overdue ? "error" : "muted", status: null },
          { label: "DUE THIS WEEK",  value: kpis.dueWeek,            tone: "warning", status: null },
          { label: "DUE THIS MONTH", value: kpis.dueMonth,           tone: "accent",  status: null },
          { label: "TONS PENDING",   value: `${kpis.tonsPending}T`,  tone: "accent",  status: null },
        ].map((k, idx) => {
          const isActive = k.status && filterStatus === k.status;
          return (
            <div
              key={k.label}
              onClick={() => k.status && setFilterStatus(isActive ? "ALL" : k.status)}
              title={k.status ? (isActive ? "Click to clear filter" : `Filter by ${k.label}`) : undefined}
              style={{
                padding: "10px 20px",
                borderRight: idx < 7 ? "1px solid var(--divider)" : "none",
                cursor: k.status ? "pointer" : "default",
                background: isActive ? "var(--accent-muted)" : "transparent",
                borderTop: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                transition: "background 0.1s",
              }}
            >
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, letterSpacing: "0.14em", textTransform: "uppercase", color: isActive ? "var(--accent)" : "var(--text-muted)", marginBottom: 4 }}>
                {k.label}
              </div>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 800,
                color: k.tone === "error" ? "var(--status-error)" : k.tone === "warning" ? "var(--status-warning)" : k.tone === "info" ? "var(--status-info)" : "var(--accent)",
              }}>
                {k.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Critical alert banner */}
      {(kpis.overdue > 0 || kpis.partial > 0) && (
        <div
          style={{
            background: "var(--danger-muted)",
            borderBottom: "1px solid var(--danger-border)",
            padding: "8px 20px",
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--status-error)", letterSpacing: "0.12em" }}>
            ATTENTION REQUIRED
          </span>
          {deliveries
            .filter((d) => d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== "Delivered")
            .slice(0, 4)
            .map((d) => {
              const daysLate = Math.max(1, Math.ceil((today - new Date(d.scheduled_date)) / 86400000));
              return (
                <span
                  key={d.id}
                  onClick={() => {
                    setSearch(projectMap[d.project_id] || "");
                  }}
                  style={{
                    background: "rgba(239,68,68,0.14)",
                    border: "1px solid rgba(239,68,68,0.3)",
                    borderRadius: 4,
                    padding: "4px 8px",
                    fontFamily: "var(--font-body)",
                    fontSize: 10,
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  {d.description || wpMap[d.work_package_id] || "Delivery"} · {d.vendor} · {daysLate}d overdue
                </span>
              );
            })}
        </div>
      )}

      {/* Filter toolbar */}
      <div
        className="filter-bar-responsive"
        style={{
          minHeight: 48,
          flexShrink: 0,
          background: "var(--bg-surface)",
          borderBottom: "1px solid var(--divider)",
          padding: "6px 20px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor, PO, project, tracking..."
          style={{
            width: 240,
            maxWidth: 260,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            padding: "6px 10px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}
        />
        {!projectId && (
          <select
            value={projectId || ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                searchParams.set("project", val);
              } else {
                searchParams.delete("project");
              }
              setSearchParams(searchParams);
            }}
            style={{
              height: 32,
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: "0 10px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
            }}
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {["ALL", "Scheduled", "In Transit", "Delivered", "Partial", "Rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--divider)",
              background: filterStatus === s ? "var(--accent)" : "var(--bg-surface)",
              color: filterStatus === s ? "var(--accent-text)" : "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              height: 32,
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              padding: "0 10px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
            }}
          >
            <option value="DUE">Due Date</option>
            <option value="PROJECT">Project</option>
            <option value="VENDOR">Vendor</option>
            <option value="TONNAGE">Tonnage</option>
          </select>
          <button
            onClick={() => setOverdueFirst((v) => !v)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--divider)",
              background: overdueFirst ? "var(--accent)" : "var(--bg-surface)",
              color: overdueFirst ? "var(--accent-text)" : "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Overdue First
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Lookahead panel — hidden when there are no deliveries at all */}
        <div
          style={{
            width: deliveries.length === 0 ? 0 : 260,
            flexShrink: 0,
            borderRight: deliveries.length === 0 ? "none" : "1px solid var(--divider)",
            background: "var(--bg-sidebar)",
            overflowY: "auto",
            overflow: deliveries.length === 0 ? "hidden" : undefined,
            transition: "width 0.2s ease",
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--divider)" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>7-DAY LOOKAHEAD</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 4 }}>
              {today.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {in7.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </div>
          </div>
          {dayList.map((day, idx) => {
            const dayDeliveries = deliveries.filter(
              (d) => d.scheduled_date && isSameDay(new Date(d.scheduled_date), day) && d.status !== "Delivered"
            );
            const isToday = isSameDay(day, today);
            return (
              <div key={idx}>
                <div
                  style={{
                    padding: "6px 16px",
                    background: isToday ? "var(--accent-muted)" : "var(--bg-sidebar)",
                    borderBottom: "1px solid var(--divider)",
                    borderTop: idx === 0 ? "none" : "1px solid var(--divider)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 700,
                      color: isToday ? "var(--accent)" : "var(--text-primary)",
                    }}
                  >
                    {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()} {day.getDate()}
                  </span>
                  {dayDeliveries.length > 0 && (
                    <span
                      style={{
                        background: "var(--accent-muted)",
                        color: "var(--accent)",
                        padding: "1px 6px",
                        borderRadius: 3,
                        fontFamily: "var(--font-mono)",
                        fontSize: 8,
                      }}
                    >
                      {dayDeliveries.length}
                    </span>
                  )}
                </div>
                {dayDeliveries.length === 0 ? (
                  <div style={{ padding: "6px 16px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontStyle: "italic" }}>— none</div>
                ) : (
                  dayDeliveries.map((d) => {
                    const colors = STATUS_COLORS[d.status] || STATUS_COLORS.Scheduled;
                    const isLate = new Date(d.scheduled_date) < today && d.status !== "Delivered";
                    return (
                      <div
                        key={d.id}
                        onClick={() => setDetail(d)}
                        style={{
                          padding: "8px 16px",
                          borderBottom: "1px solid var(--divider)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 3,
                          borderLeft: `3px solid ${colors.border}`,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>{d.vendor}</span>
                          {renderStatusPill(d.status)}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {d.description || wpMap[d.work_package_id] || "—"}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
                          {d.pieces || 0} pcs · {d.weight_tons || 0}T · {projectMap[d.project_id] || ""}
                          {isLate && <span style={{ marginLeft: 6, color: "var(--status-error)" }}>{Math.ceil((today - new Date(d.scheduled_date)) / 86400000)}d late</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })}

          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--divider)", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em" }}>
            NEXT 30 DAYS
          </div>
          {deliveries
            .filter((d) => {
              if (!d.scheduled_date) return false;
              const dt = new Date(d.scheduled_date);
              return dt > in7 && dt <= in30 && d.status !== "Delivered";
            })
            .sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date))
            .map((d) => (
              <div key={d.id} style={{ padding: "6px 16px", borderBottom: "1px solid var(--divider)", fontSize: 10, color: "var(--text-primary)" }}>
                {new Date(d.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {d.vendor} · {d.description || wpMap[d.work_package_id] || "—"} · {d.weight_tons || 0}T
              </div>
            ))}
        </div>

        {/* Right panel */}
        <div style={{ flex: 1, overflowY: "auto", position: "relative", background: "var(--bg-page)" }}>
          {deliveries.length === 0 ? (
            /* Hero empty state */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 0, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 20, opacity: 0.3 }}>🚛</div>
              <div style={{ fontFamily: "Space Grotesk, var(--font-display), sans-serif", fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.01em", marginBottom: 10 }}>
                No Shipments Tracked
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 360, lineHeight: 1.6, marginBottom: 28 }}>
                Start tracking steel deliveries, vendor shipments, and material arrivals. Log your first delivery to enable the lookahead schedule and overdue alerts.
              </div>
              <button
                onClick={() => { setEditing(null); setDetail(null); setShowForm(true); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 28px", background: "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
              >
                + Add First Delivery
              </button>
            </div>
          ) : view === "TABLE" ? (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 5,
                  display: "grid",
                  gridTemplateColumns: "28px 100px 150px 2fr 140px 100px 90px 90px 72px 90px 110px",
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
              {projectId ? filtered.map(renderRow) : Object.entries(grouped || {}).map(([name, list]) => renderProjectGroup(name, list))}
            </div>
          ) : (
            <TimelineView />
          )}
        </div>
      </div>

      {/* Bulk bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--bg-surface)",
            borderTop: "1px solid var(--divider)",
            padding: "10px 20px",
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>
            {selectedIds.size} SELECTED
          </span>
          <button
            onClick={() => bulkUpdate("In Transit")}
            disabled={bulkUpdateMut.isPending}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--status-info)",
              background: "rgba(0,229,255,0.06)",
              color: "var(--status-info)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkUpdateMut.isPending ? "not-allowed" : "pointer",
              opacity: bulkUpdateMut.isPending ? 0.6 : 1,
            }}
          >
            → IN TRANSIT
          </button>
          <button
            onClick={() => bulkUpdate("Delivered")}
            disabled={bulkUpdateMut.isPending}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--status-success)",
              background: "rgba(34,197,94,0.12)",
              color: "var(--status-success)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkUpdateMut.isPending ? "not-allowed" : "pointer",
              opacity: bulkUpdateMut.isPending ? 0.6 : 1,
            }}
          >
            ✓ DELIVERED
          </button>
          <button
            onClick={() => bulkUpdate("Partial")}
            disabled={bulkUpdateMut.isPending}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--status-warning)",
              background: "rgba(234,179,8,0.12)",
              color: "var(--status-warning)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: bulkUpdateMut.isPending ? "not-allowed" : "pointer",
              opacity: bulkUpdateMut.isPending ? 0.6 : 1,
            }}
          >
            PARTIAL
          </button>
          <button
            onClick={() => exportToCSV(deliveries.filter((d) => selectedIds.has(d.id)), projectMap, wpMap, "deliveries-selected.csv")}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            EXPORT CSV
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              marginLeft: "auto",
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--divider)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              cursor: "pointer",
            }}
          >
            Deselect All
          </button>
        </div>
      )}

      {/* Modals */}
      {showForm && <DeliveryFormModal projectId={projectId} onClose={() => setShowForm(false)} />}
      {editing && <DeliveryFormModal projectId={editing.project_id || projectId} delivery={editing} onClose={() => setEditing(null)} />}
      <DetailDrawer />
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

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.12em", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>
    </div>
  );
}

function GridRow({ label, value, action, actionLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{value}</span>
        {action && (
          <button
            onClick={action}
            style={{ padding: "2px 6px", borderRadius: 4, border: "1px solid var(--divider)", background: "var(--bg-surface)", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9 }}
          >
            {actionLabel || "Open"}
          </button>
        )}
      </div>
    </div>
  );
}
