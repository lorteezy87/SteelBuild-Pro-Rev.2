import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { toast } from "sonner";
import { AlertTriangle, Users, Wrench, Truck, HardHat, Download, Zap, ChevronRight, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ResourceFormModal from "@/components/resources/ResourceFormModal";
import ResourceList from "@/components/resources/ResourceList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import PageHeader from "@/components/shared/PageHeader";
import KPIStrip from "@/components/shared/KPIStrip";
import SearchFilter from "@/components/shared/SearchFilter";
import { PhoenixPanel } from "@/components/shared/PhoenixPanel";
import { formatCurrency } from "@/components/shared/formatters";

/* ── Keyframes ── */
const STYLE_ID = "resource-mgmt-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes overAllocPulse {
      0%, 100% { box-shadow: 0 0 8px rgba(239,68,68,0.15); }
      50%      { box-shadow: 0 0 22px rgba(239,68,68,0.45); }
    }
    @keyframes ghostShimmer {
      0%   { opacity: 0.25; }
      50%  { opacity: 0.42; }
      100% { opacity: 0.25; }
    }
  `;
  document.head.appendChild(style);
}

/* ── Type icons ── */
const TYPE_ICONS = {
  Labor: Users,
  Equipment: Wrench,
  Subcontractor: HardHat,
  Material: Truck,
};

const TYPE_COLORS = {
  Labor: "#3B82F6",
  Equipment: "#E3B341",
  Subcontractor: "#A78BFA",
  Material: "#3FB950",
};

/* ── Capacity Bar ── */
function CapacityBar({ label, icon: Icon, budgetHrs, actualHrs, forecastHrs, color, count }) {
  const utilization = budgetHrs > 0 ? Math.round((actualHrs / budgetHrs) * 100) : 0;
  const forecastPct = budgetHrs > 0 ? Math.min(100, Math.round((forecastHrs / budgetHrs) * 100)) : 0;
  const overBudget = actualHrs > budgetHrs && budgetHrs > 0;

  return (
    <div style={{ padding: "10px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {Icon && <Icon size={12} style={{ color, flexShrink: 0 }} />}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>
          {label}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
          {count} resource{count !== 1 ? "s" : ""}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: overBudget ? "var(--status-error)" : "var(--text-secondary)" }}>
          {utilization}%
        </span>
      </div>
      {/* Double-layer bar: actual + forecast */}
      <div style={{ position: "relative", height: 10, background: "var(--bg-void)", borderRadius: 5, overflow: "hidden" }}>
        {/* Forecast layer */}
        {forecastPct > 0 && (
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${Math.min(100, forecastPct)}%`,
            background: `${color}30`, borderRadius: 5,
            transition: "width 0.4s",
          }} />
        )}
        {/* Actual layer */}
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          width: `${Math.min(100, utilization)}%`,
          background: overBudget ? "var(--status-error)" : color,
          borderRadius: 5, transition: "width 0.4s",
        }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
          Budget: {budgetHrs.toLocaleString()}h
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: overBudget ? "var(--status-error)" : "var(--text-muted)" }}>
          Actual: {actualHrs.toLocaleString()}h
        </span>
        {forecastHrs > 0 && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
            Forecast: {forecastHrs.toLocaleString()}h
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Ghost data for empty state ── */
const GHOST_RESOURCES = [
  { name: "Welding Team A", type: "Labor", role: "CWI / Fitter", hours: "320h budget" },
  { name: "Trucking Fleet", type: "Equipment", role: "Flatbed / Lowboy", hours: "160h budget" },
  { name: "Ironworkers Local 86", type: "Subcontractor", role: "Erection Crew", hours: "480h budget" },
];

/* ================================================================
   Main Component
   ================================================================ */
export default function ResourceManagement() {
  const qc = useQueryClient();
  const { activeProject } = useProjectContext();
  const projectId = activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  // ── Queries ──
  const { data: resources = [], isLoading, refetch } = useQuery({
    queryKey: ["resources", projectId],
    queryFn: () => projectId
      ? base44.entities.Resource.filter({ project_id: projectId })
      : base44.entities.Resource.list(),
  });

  const { data: workPackages = [] } = useQuery({
    queryKey: ["work-packages", projectId],
    queryFn: () => projectId
      ? base44.entities.WorkPackage.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["deliveries", projectId],
    queryFn: () => projectId
      ? base44.entities.Delivery.filter({ project_id: projectId })
      : [],
    enabled: !!projectId,
    staleTime: 2 * 60 * 1000,
  });

  // ── Mutations ──
  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Resource.create({
      ...data,
      budget_hours: data.budget_hours ? parseFloat(data.budget_hours) : 0,
      actual_hours: parseFloat(data.actual_hours) || 0,
      forecast_hours: data.forecast_hours ? parseFloat(data.forecast_hours) : 0,
      hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource created");
      setShowForm(false);
      setEditing(null);
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Resource.update(id, {
      ...data,
      budget_hours: data.budget_hours ? parseFloat(data.budget_hours) : 0,
      actual_hours: parseFloat(data.actual_hours) || 0,
      forecast_hours: data.forecast_hours ? parseFloat(data.forecast_hours) : 0,
      hourly_rate: data.hourly_rate ? parseFloat(data.hourly_rate) : 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource updated");
      setShowForm(false);
      setEditing(null);
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => base44.entities.Resource.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resources"] });
      toast.success("Resource deleted");
      setDeleteTarget(null);
    },
    onError: (e) => toast.error("Failed: " + (e?.message || "Unknown error")),
  });

  const handleSave = (data) => {
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  // ── Filters ──
  const filtered = useMemo(() => resources.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.name?.toLowerCase().includes(q) || r.role?.toLowerCase().includes(q) || r.resource_type?.toLowerCase().includes(q);
    const matchType = filterType === "all" || r.resource_type === filterType;
    const matchStatus = filterStatus === "all" || r.availability_status === filterStatus;
    return matchSearch && matchType && matchStatus;
  }), [resources, search, filterType, filterStatus]);

  // ── Capacity by type ──
  const capacityByType = useMemo(() => {
    const types = ["Labor", "Equipment", "Subcontractor", "Material"];
    return types.map(type => {
      const typeRes = resources.filter(r => r.resource_type === type);
      return {
        type,
        icon: TYPE_ICONS[type],
        color: TYPE_COLORS[type],
        count: typeRes.length,
        budgetHrs: typeRes.reduce((s, r) => s + (Number(r.budget_hours) || 0), 0),
        actualHrs: typeRes.reduce((s, r) => s + (Number(r.actual_hours) || 0), 0),
        forecastHrs: typeRes.reduce((s, r) => s + (Number(r.forecast_hours) || 0), 0),
      };
    }).filter(t => t.count > 0);
  }, [resources]);

  // ── Issues / Readiness signals ──
  const issues = useMemo(() => {
    const items = [];

    // Over-allocated resources
    const overAlloc = resources.filter(r => r.availability_status === "Over-Allocated");
    if (overAlloc.length > 0) {
      items.push({
        severity: "critical", color: "var(--status-error)",
        label: `${overAlloc.length} over-allocated resource${overAlloc.length !== 1 ? "s" : ""}`,
        detail: overAlloc.map(r => r.name).slice(0, 3).join(", "),
        action: "Redistribute load",
      });
    }

    // Resources over budget (actual > budget by 10%+)
    const overBudget = resources.filter(r => {
      const budget = Number(r.budget_hours) || 0;
      const actual = Number(r.actual_hours) || 0;
      return budget > 0 && actual > budget * 1.1;
    });
    if (overBudget.length > 0) {
      items.push({
        severity: "high", color: "var(--status-warning)",
        label: `${overBudget.length} resource${overBudget.length !== 1 ? "s" : ""} over budget`,
        detail: overBudget.map(r => `${r.name} (${Math.round((Number(r.actual_hours) / Number(r.budget_hours)) * 100)}%)`).slice(0, 3).join(", "),
        action: "Review forecast",
      });
    }

    // No budget hours set
    const noBudget = resources.filter(r => !Number(r.budget_hours));
    if (noBudget.length > 0) {
      items.push({
        severity: "medium", color: "var(--status-info)",
        label: `${noBudget.length} resource${noBudget.length !== 1 ? "s" : ""} without budget`,
        detail: noBudget.map(r => r.name).slice(0, 3).join(", "),
        action: "Set budget hours",
      });
    }

    // Upcoming deliveries needing resources (within 7 days)
    const now = new Date();
    const upcomingDels = deliveries.filter(d => {
      if (d.status === "Delivered" || d.status === "Cancelled") return false;
      const sched = d.scheduled_date ? new Date(d.scheduled_date) : null;
      if (!sched) return false;
      const diff = (sched - now) / 86400000;
      return diff >= 0 && diff <= 7;
    });
    if (upcomingDels.length > 0) {
      items.push({
        severity: "high", color: "var(--status-warning)",
        label: `${upcomingDels.length} deliver${upcomingDels.length !== 1 ? "ies" : "y"} in next 7 days`,
        detail: upcomingDels.map(d => d.delivery_title || d.delivery_number).slice(0, 3).join(", "),
        action: "Confirm crew ready",
      });
    }

    // Active WPs without crew assignment
    const activWPs = workPackages.filter(wp => {
      const active = wp.status === "In Progress" || wp.status === "Active";
      return active && !wp.crew;
    });
    if (activWPs.length > 0) {
      items.push({
        severity: "medium", color: "var(--status-info)",
        label: `${activWPs.length} active WP${activWPs.length !== 1 ? "s" : ""} without crew`,
        detail: activWPs.map(wp => wp.wp_number || wp.name).slice(0, 3).join(", "),
        action: "Assign crew",
      });
    }

    return items;
  }, [resources, deliveries, workPackages]);

  // ── KPIs ──
  const totalBudget = resources.reduce((s, r) => s + (Number(r.budget_hours) || 0), 0);
  const totalActual = resources.reduce((s, r) => s + (Number(r.actual_hours) || 0), 0);
  const totalCost = resources.reduce((s, r) => s + ((Number(r.actual_hours) || 0) * (Number(r.hourly_rate) || 0)), 0);
  const overAllocCount = resources.filter(r => r.availability_status === "Over-Allocated").length;
  const utilization = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;

  const kpis = [
    { label: "Resources", value: resources.length, color: "slate" },
    { label: "Budget Hours", value: `${totalBudget.toLocaleString()}h`, color: "blue" },
    { label: "Actual Hours", value: `${totalActual.toLocaleString()}h`, color: totalActual > totalBudget ? "rose" : "green" },
    { label: "Utilization", value: `${utilization}%`, color: utilization > 100 ? "rose" : utilization > 80 ? "amber" : "green" },
    { label: "Labor Cost", value: formatCurrency(totalCost), color: "purple" },
    { label: "Over-Allocated", value: overAllocCount, color: overAllocCount > 0 ? "rose" : "slate" },
  ];

  const exportCSV = () => {
    const headers = ["Name", "Type", "Role", "Status", "Budget Hrs", "Actual Hrs", "Forecast Hrs", "Rate", "Utilization"];
    const rows = filtered.map(r => {
      const util = Number(r.budget_hours) > 0 ? Math.round((Number(r.actual_hours) / Number(r.budget_hours)) * 100) : 0;
      return [r.name, r.resource_type, r.role, r.availability_status, r.budget_hours, r.actual_hours, r.forecast_hours, r.hourly_rate, `${util}%`];
    });
    const csv = [headers, ...rows].map(r => r.map(cell => `"${cell ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "resources.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Resource Management"
        subtitle={`${resources.length} resource${resources.length !== 1 ? "s" : ""} \u00B7 ${utilization}% utilization`}
        onAdd={() => { setEditing(null); setShowForm(true); }}
        onRefresh={refetch}
        addLabel="New Resource"
      />

      <KPIStrip items={kpis} />

      {/* ── Capacity vs Load ── */}
      {capacityByType.length > 0 && (
        <PhoenixPanel
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <BarChart3 size={14} style={{ color: "var(--accent-light)" }} />
            Capacity vs Load
          </span>}
          style={{ marginBottom: 14 }}
        >
          <div style={{ padding: "8px 16px" }}>
            {capacityByType.map(t => (
              <CapacityBar
                key={t.type}
                label={t.type}
                icon={t.icon}
                budgetHrs={t.budgetHrs}
                actualHrs={t.actualHrs}
                forecastHrs={t.forecastHrs}
                color={t.color}
                count={t.count}
              />
            ))}
            {/* Totals row */}
            <div style={{ borderTop: "1px solid var(--divider)", paddingTop: 8, marginTop: 4, display: "flex", gap: 24 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em" }}>
                TOTAL
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                Budget: {totalBudget.toLocaleString()}h
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: totalActual > totalBudget ? "var(--status-error)" : "var(--text-secondary)", fontWeight: 700 }}>
                Actual: {totalActual.toLocaleString()}h
              </span>
              {totalCost > 0 && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent-light)", fontWeight: 700, marginLeft: "auto" }}>
                  {formatCurrency(totalCost)} labor cost
                </span>
              )}
            </div>
          </div>
        </PhoenixPanel>
      )}

      {/* ── Issues & Readiness Panel ── */}
      {issues.length > 0 && (
        <PhoenixPanel
          title={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Zap size={14} style={{ color: "var(--status-warning)" }} />
            Issues & Readiness
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", fontWeight: 400 }}>
              {issues.length} item{issues.length !== 1 ? "s" : ""}
            </span>
          </span>}
          style={{ marginBottom: 14, border: issues.some(i => i.severity === "critical") ? "1px solid rgba(248,81,73,0.3)" : "1px solid rgba(227,179,65,0.3)" }}
        >
          <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {issues.map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px",
                background: "var(--bg-surface-low)",
                borderRadius: "var(--radius-card)",
                borderLeft: `3px solid ${item.color}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: item.color, marginBottom: 2 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
                    {item.detail}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: item.color, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                  {item.action} <ChevronRight size={10} />
                </div>
              </div>
            ))}
          </div>
        </PhoenixPanel>
      )}

      {/* ── Search & Filters ── */}
      <div className="filter-bar-responsive" style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <SearchFilter search={search} onSearchChange={setSearch} filters={[
            { key: "type", value: filterType, onChange: setFilterType, placeholder: "Type", options: ["Labor", "Equipment", "Subcontractor", "Material"] },
            { key: "status", value: filterStatus, onChange: setFilterStatus, placeholder: "Status", options: ["Available", "Allocated", "Over-Allocated", "On Leave"] },
          ]} />
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} style={{ marginBottom: 16 }}>
          <Download className="w-3.5 h-3.5 mr-1" />Export
        </Button>
      </div>

      {/* ── Empty State ── */}
      {!isLoading && resources.length === 0 && (
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--divider)",
          borderRadius: "var(--radius-card)", padding: "60px 32px", textAlign: "center",
        }}>
          <Users size={48} strokeWidth={1.5} style={{ color: "var(--text-disabled)", marginBottom: 16 }} />
          <div style={{ fontFamily: "var(--font-body)", fontSize: 20, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
            No Resources Yet
          </div>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", maxWidth: 480, margin: "0 auto 16px" }}>
            Add crews, equipment, and subcontractors to track capacity, detect conflicts, and ensure readiness for every work package.
          </div>

          {/* Ghost cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 500, margin: "0 auto 24px" }}>
            {GHOST_RESOURCES.map((ghost, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 16, padding: "10px 14px",
                background: "var(--bg-surface-low)", border: "1px dashed var(--divider)",
                borderRadius: "var(--radius-card)", animation: `ghostShimmer 2.5s ease-in-out infinite`,
                animationDelay: `${i * 0.4}s`,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-disabled)", flex: 1, textAlign: "left" }}>{ghost.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>{ghost.type}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-disabled)" }}>{ghost.hours}</span>
              </div>
            ))}
          </div>

          <Button
            onClick={() => { setEditing(null); setShowForm(true); }}
            style={{ background: "var(--accent)", color: "#fff", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, letterSpacing: "0.06em" }}
          >
            + Add First Resource
          </Button>
        </div>
      )}

      {/* ── Resource List ── */}
      {resources.length > 0 && (
        <ResourceList
          resources={filtered}
          onEdit={(r) => { setEditing(r); setShowForm(true); }}
          onDelete={setDeleteTarget}
        />
      )}

      {/* ── Modals ── */}
      {showForm && (
        <ResourceFormModal
          projectId={projectId}
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteMut.mutate(deleteTarget.id)}
        title="Delete Resource"
        description={`Delete ${deleteTarget?.name}? This cannot be undone.`}
      />
    </div>
  );
}
