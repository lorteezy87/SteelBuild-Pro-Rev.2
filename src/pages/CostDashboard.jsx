import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import CostCodeFormModal from "@/components/financials/CostCodeFormModal";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { useProjectContext } from "../components/shared/ProjectContext";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
import KPIStrip from "../components/shared/KPIStrip";
import ProgressBar from "../components/shared/ProgressBar";
import PhoenixTable, { PTR, PTD } from "../components/shared/PhoenixTable";
import { formatCurrency, formatCurrencyShort, formatPercent, formatDateShort } from "../components/shared/formatters";
import { COST_CODES, CATEGORY_COLORS, CATEGORY_ORDER } from "../components/shared/costCodes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Line, ReferenceLine, Area, AreaChart
} from "recharts";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button as IconButton } from "@/components/ui/button";
import { toast } from "sonner";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import {
  appendRecordToCaches,
  replaceRecordInCaches,
  removeRecordFromCaches,
  invalidateCrudQueries,
  toastCrudError,
} from "@/components/shared/crudFeedback";
import { usePermissions } from "@/services/permissions";
import { Button as DSButton, CommandBar } from "@/components/design-system";

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--accent-border)", borderRadius: 8,
      padding: "10px 14px", fontFamily: "var(--font-mono)", fontSize: 10,
      color: "var(--text-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)"
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--accent)", fontSize: 11 }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{entry.name}:</span>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
};

function VarianceAlertCard({ code, description, phase, variance, pctOver, contingency }) {
  const exceedsContingency = Math.abs(variance) > contingency;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px",
      borderBottom: "1px solid var(--hover-bg)",
      borderLeft: exceedsContingency ? "3px solid var(--status-error)" : "3px solid var(--status-warning)",
      background: exceedsContingency ? "var(--danger-muted)" : "var(--warning-muted)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {exceedsContingency
          ? <ShieldAlert size={16} style={{ color: "var(--status-error)" }} />
          : <AlertTriangle size={16} style={{ color: "var(--status-warning)" }} />}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 600 }}>
            {code} — {description}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
            {phase} {exceedsContingency ? "• EXCEEDS CONTINGENCY" : "• OVER BUDGET"}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--status-error)" }}>
          +{formatCurrency(Math.abs(variance))}
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)" }}>
          {pctOver.toFixed(1)}% over
        </div>
      </div>
    </div>
  );
}

export default function CostDashboard() {
  const { activeProject } = useProjectContext();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [deleteCodeTarget, setDeleteCodeTarget] = useState(null);

  const costCodeQueryKeys = [["cost-codes-dash", activeProject?.id]];

  const createCodeMut = useMutation({
    mutationFn: (d) => base44.entities.CostCode.create({ ...d, project_id: d.project_id || activeProject?.id }),
    onSuccess: (created) => {
      appendRecordToCaches(qc, costCodeQueryKeys, created);
      invalidateCrudQueries(qc, costCodeQueryKeys);
      toast.success("Cost code created");
      setCodeModalOpen(false);
      setEditingCode(null);
    },
    onError: (e) => toastCrudError(e, "Failed to create cost code"),
  });
  const updateCodeMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CostCode.update(id, data),
    onSuccess: (updated) => {
      replaceRecordInCaches(qc, costCodeQueryKeys, updated);
      invalidateCrudQueries(qc, costCodeQueryKeys);
      toast.success("Cost code updated");
      setCodeModalOpen(false);
      setEditingCode(null);
    },
    onError: (e) => toastCrudError(e, "Failed to update cost code"),
  });
  const deleteCodeMut = useMutation({
    mutationFn: (id) => base44.entities.CostCode.delete(id),
    onSuccess: (_, deletedId) => {
      removeRecordFromCaches(qc, costCodeQueryKeys, deletedId);
      invalidateCrudQueries(qc, costCodeQueryKeys);
      toast.success("Cost code deleted");
      setDeleteCodeTarget(null);
    },
    onError: (e) => toastCrudError(e, "Failed to delete cost code"),
  });

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["cost-codes-dash", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.CostCode.filter({ project_id: activeProject.id }, "cost_code_number")
      : [],
    select: (rows) => [...rows].sort((a, b) => (a.cost_code_number || "").localeCompare(b.cost_code_number || "", undefined, { numeric: true })),
    enabled: !!activeProject?.id,
  });

  useRealtimeInvalidation("cost_codes", activeProject?.id, costCodeQueryKeys);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: cos = [] } = useQuery({
    queryKey: ["change-orders-dash", activeProject?.id],
    queryFn: () => activeProject?.id
      ? base44.entities.ChangeOrder.filter({ project_id: activeProject.id }, "-created_at")
      : [],
    enabled: !!activeProject?.id,
  });

  const { data: wps = [] } = useQuery({
    queryKey: ['wps-cost', activeProject?.id],
    queryFn: () => activeProject?.id ? base44.entities.WorkPackage.filter({ project_id: activeProject.id }) : [],
    enabled: !!activeProject?.id,
  });

  const { data: sovs = [] } = useQuery({
    queryKey: ['sovs-cost', activeProject?.id],
    queryFn: () => activeProject?.id ? base44.entities.SOVItem.filter({ project_id: activeProject.id }) : [],
    enabled: !!activeProject?.id,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ['deliveries-cost', activeProject?.id],
    queryFn: () => activeProject?.id ? base44.entities.Delivery.filter({ project_id: activeProject.id }) : [],
    enabled: !!activeProject?.id,
  });

  const project = projects.find(p => p.id === activeProject?.id);
  const contingency = Number(project?.contingency_amount) || 0;
  const contractVal = project
    ? (Number(project.original_contract_value) || 0) + cos.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0)
    : 0;

  const totalBudget = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalActual = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
  const totalCommitted = codes.reduce((s, c) => s + (Number(c.committed_cost) || 0), 0);
  const totalForecast = codes.reduce((s, c) => s + (Number(c.forecast_to_complete) || 0), 0);
  const totalVariance = totalActual - totalBudget;
  const eac = totalActual + totalForecast;

  const barChartData = useMemo(() => {
    return codes.map(c => {
      const cc = COST_CODES.find(x => x.code === c.cost_code_number);
      return {
        code: c.cost_code_number,
        name: cc?.name || c.description || c.cost_code_number,
        label: `${c.cost_code_number}`,
        budget: Number(c.budget_amount) || 0,
        actual: Number(c.actual_cost) || 0,
        committed: Number(c.committed_cost) || 0,
        variance: (Number(c.actual_cost) || 0) - (Number(c.budget_amount) || 0),
      };
    }).filter(d => d.budget > 0 || d.actual > 0 || d.committed > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [codes]);

  const categoryPieData = useMemo(() => {
    return CATEGORY_ORDER.map(cat => {
      const catCodes = codes.filter(c => c.phase === cat);
      const total = catCodes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
      return { name: cat, value: total };
    }).filter(d => d.value > 0);
  }, [codes]);

  const varianceAlerts = useMemo(() => {
    return codes
      .filter(c => {
        const budget = Number(c.budget_amount) || 0;
        const actual = Number(c.actual_cost) || 0;
        return budget > 0 && actual > budget;
      })
      .map(c => {
        const budget = Number(c.budget_amount) || 0;
        const actual = Number(c.actual_cost) || 0;
        const variance = actual - budget;
        const pctOver = budget > 0 ? ((actual - budget) / budget) * 100 : 0;
        return {
          id: c.id, code: c.cost_code_number, description: c.description,
          phase: c.phase, variance, pctOver,
          exceedsContingency: contingency > 0 && variance > contingency,
        };
      })
      .sort((a, b) => b.variance - a.variance);
  }, [codes, contingency]);

  const marginAtRisk = useMemo(() => {
    return codes.map(c => {
      const budget = Number(c.budget_amount) || 0;
      const actual = Number(c.actual_cost) || 0;
      const committed = Number(c.committed_cost) || 0;
      const forecast = Number(c.forecast_to_complete) || 0;
      const eac = actual + forecast;
      const exposure = eac - budget;
      const marginRisk = budget > 0 ? (exposure / budget) * 100 : 0;
      return { id: c.id, code: c.cost_code_number, description: c.description, phase: c.phase, budget, actual, committed, forecast, eac, exposure, marginRisk, atRisk: exposure > 0 };
    }).filter(c => c.budget > 0).sort((a, b) => b.exposure - a.exposure);
  }, [codes]);

  const coAging = useMemo(() => {
    const today = new Date();
    return cos.map(co => {
      const submitted = co.submitted_date ? new Date(co.submitted_date) : null;
      const daysOpen = submitted ? Math.floor((today - submitted) / 86400000) : null;
      return { ...co, daysOpen, isStale: daysOpen !== null && daysOpen > 30 && !['Approved', 'Rejected', 'Void'].includes(co.status) };
    }).sort((a, b) => (b.daysOpen || 0) - (a.daysOpen || 0));
  }, [cos]);

  const billingMetrics = useMemo(() => {
    const totalScheduled = sovs.reduce((s, sv) => s + (Number(sv.scheduled_value) || 0), 0);
    const earnedValue = sovs.reduce((s, sv) => {
      const scheduled = Number(sv.scheduled_value) || 0;
      const pct = Number(sv.current_percent_complete) || 0;
      return s + scheduled * (pct / 100);
    }, 0);
    // billedToDate = cumulative billed (current_percent_complete reflects total billed %)
    // The period draw (currPct - prevPct) is only for the current invoice, not cumulative.
    const billedToDate = sovs.reduce((s, sv) => {
      const scheduled = Number(sv.scheduled_value) || 0;
      const currPct = Number(sv.current_percent_complete) || 0;
      return s + scheduled * (currPct / 100);
    }, 0);
    const unbilledEV = earnedValue - billedToDate;
    const billingLag = earnedValue > 0 ? ((earnedValue - billedToDate) / earnedValue) * 100 : 0;
    return {
      totalScheduled, earnedValue, billedToDate, unbilledEV, billingLag,
      billingEfficiency: earnedValue > 0 ? (billedToDate / earnedValue) * 100 : 0,
    };
  }, [sovs]);

  const productivity = useMemo(() => {
    const shopWPs = wps.filter(w => w.shop_hours_budget > 0);
    const fieldWPs = wps.filter(w => w.field_hours_budget > 0);
    const shopBudget = shopWPs.reduce((s, w) => s + (Number(w.shop_hours_budget) || 0), 0);
    const shopActual = shopWPs.reduce((s, w) => s + (Number(w.shop_hours_actual) || 0), 0);
    const fieldBudget = fieldWPs.reduce((s, w) => s + (Number(w.field_hours_budget) || 0), 0);
    const fieldActual = fieldWPs.reduce((s, w) => s + (Number(w.field_hours_actual) || 0), 0);
    const totalTons = wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    const completedTons = wps.filter(w => w.status === 'Complete' || w.phase === 'Delivery' || w.phase === 'Erection').reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    const shopEfficiency = shopBudget > 0 ? (shopActual / shopBudget) * 100 : 0;
    const fieldEfficiency = fieldBudget > 0 ? (fieldActual / fieldBudget) * 100 : 0;
    const shopHrsPerTon = completedTons > 0 ? shopActual / completedTons : 0;
    const budgetShopHrsPerTon = totalTons > 0 ? shopBudget / totalTons : 0;
    const byWP = wps
      .filter(w => (w.shop_hours_budget > 0 || w.field_hours_budget > 0) && (w.shop_hours_actual > 0 || w.field_hours_actual > 0))
      .map(w => ({
        name: w.wp_number || w.name,
        shopBudget: Number(w.shop_hours_budget) || 0,
        shopActual: Number(w.shop_hours_actual) || 0,
        fieldBudget: Number(w.field_hours_budget) || 0,
        fieldActual: Number(w.field_hours_actual) || 0,
        shopEff: w.shop_hours_budget > 0 ? (w.shop_hours_actual / w.shop_hours_budget) * 100 : 0,
        fieldEff: w.field_hours_budget > 0 ? (w.field_hours_actual / w.field_hours_budget) * 100 : 0,
        tonnage: Number(w.tonnage) || 0,
      })).sort((a, b) => b.shopEff - a.shopEff);
    return { shopBudget, shopActual, fieldBudget, fieldActual, shopEfficiency, fieldEfficiency, shopHrsPerTon, budgetShopHrsPerTon, totalTons, completedTons, byWP };
  }, [wps]);

  const procurementExposure = useMemo(() => {
    const today = new Date();
    const in30 = new Date(today.getTime() + 30 * 86400000);
    const in60 = new Date(today.getTime() + 60 * 86400000);
    const scheduled = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Cancelled');
    const due30 = scheduled.filter(d => d.scheduled_date && new Date(d.scheduled_date) <= in30 && new Date(d.scheduled_date) >= today);
    const due60 = scheduled.filter(d => d.scheduled_date && new Date(d.scheduled_date) > in30 && new Date(d.scheduled_date) <= in60);
    const late = scheduled.filter(d => d.scheduled_date && new Date(d.scheduled_date) < today);
    return { total: scheduled.length, late: late.length, due30: due30.length, due60: due60.length, lateItems: late.slice(0, 5), due30Items: due30.slice(0, 5) };
  }, [deliveries]);

  const cumulativeData = useMemo(() => {
    const sorted = [...codes].sort((a, b) => {
      return (Number(b.budget_amount) || 0) - (Number(a.budget_amount) || 0);
    });
    let cumBudget = 0, cumActual = 0, cumCommitted = 0;
    return sorted.map(c => {
      cumBudget += Number(c.budget_amount) || 0;
      cumActual += Number(c.actual_cost) || 0;
      cumCommitted += Number(c.committed_cost) || 0;
      return { name: c.cost_code_number, budget: cumBudget, actual: cumActual, committed: cumCommitted };
    });
  }, [codes]);

  const consumedContingency = codes.reduce((s, c) => {
    const v = (Number(c.actual_cost) || 0) - (Number(c.budget_amount) || 0);
    return s + Math.max(0, v);
  }, 0);
  const contingencyRemaining = Math.max(0, contingency - consumedContingency);

  const kpis = [
    { label: "Contract Value", value: formatCurrencyShort(contractVal), color: "blue" },
    { label: "Total Budget", value: formatCurrencyShort(totalBudget), color: "slate" },
    { label: "Actual Spend", value: formatCurrencyShort(totalActual), color: totalActual > totalBudget ? "rose" : "green" },
    { label: "Committed", value: formatCurrencyShort(totalCommitted), color: "amber" },
    { label: "EAC", value: formatCurrencyShort(eac), sub: eac > totalBudget ? "Over budget" : "Within budget", color: eac > totalBudget ? "rose" : "green" },
    { label: "Contingency", value: formatCurrencyShort(contingency), sub: contingency > 0 ? `${formatPercent(contingency > 0 ? (contingencyRemaining / contingency) * 100 : 0)} remaining` : "Not set", color: consumedContingency > contingency ? "rose" : "purple" },
  ];

  const exportCSV = () => {
    const headers = ["Code", "Description", "Phase", "Budget", "Actual", "Committed", "Forecast", "Variance", "% Used"];
    const rows = codes.map(c => {
      const budget = Number(c.budget_amount) || 0;
      const actual = Number(c.actual_cost) || 0;
      return [c.cost_code_number, c.description, c.phase, budget, actual, Number(c.committed_cost) || 0, Number(c.forecast_to_complete) || 0, actual - budget, budget > 0 ? ((actual / budget) * 100).toFixed(1) + "%" : "0%"];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c ?? ""}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `cost_dashboard_${activeProject?.name || "export"}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (!activeProject?.id) return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 }}>Select a project to view Cost Dashboard</div>
      <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Use the project selector in the top right.</div>
    </div>
  );

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "6px 24px 24px" }}>
      <CommandBar
        eyebrow={project?.name || "COST"}
        title="Cost Dashboard"
        count={codes.length}
        unit=" · COST CODES"
        subtitle="Budget vs actual vs committed · variance monitoring"
      >
        <DSButton variant="secondary" icon="download" onClick={exportCSV}>
          Export
        </DSButton>
        {can("create", "cost_code") && (
          <DSButton variant="primary" icon="plus" onClick={() => { setEditingCode(null); setCodeModalOpen(true); }}>
            Add Cost Code
          </DSButton>
        )}
      </CommandBar>

      <KPIStrip items={kpis} />

      {varianceAlerts.length > 0 && (
        <PhoenixPanel title="Variance Alerts" count={varianceAlerts.length}
          actions={<span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "rgba(255,23,68,0.72)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{varianceAlerts.filter(a => a.exceedsContingency).length} exceed contingency</span>}
          style={{ marginBottom: 14 }}>
          {varianceAlerts.map(a => (
            <VarianceAlertCard key={a.id} code={a.code} description={a.description} phase={a.phase} variance={a.variance} pctOver={a.pctOver} contingency={contingency} />
          ))}
        </PhoenixPanel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14, marginBottom: 14 }}>
        <PhoenixPanel title="Budget vs Actual vs Committed" style={{ gridColumn: barChartData.length > 6 ? "span 2" : "span 1" }}>
          <div style={{ padding: 16 }}>
            {barChartData.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>No cost data to display</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
                  <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={{ stroke: "var(--border-default)" }} />
                  <YAxis tick={{ fill: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={{ stroke: "var(--border-default)" }} tickFormatter={v => formatCurrencyShort(v)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconSize={8} wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }} />
                  <Bar dataKey="budget" name="Budget" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="committed" name="Committed" fill="#FFB300" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </PhoenixPanel>

        {barChartData.length <= 6 && (
          <PhoenixPanel title="Spend by Category">
            <div style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {categoryPieData.length === 0 ? (
                <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>No spend data</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={categoryPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" stroke="none" paddingAngle={2}>
                      {categoryPieData.map((d, i) => <Cell key={i} fill={CATEGORY_COLORS[d.name] || "var(--accent)"} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </PhoenixPanel>
        )}
      </div>

      {cumulativeData.length > 1 && (
        <PhoenixPanel title="Cumulative Spend Curve" style={{ marginBottom: 14 }}>
          <div style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="budgetGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.20} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
                <XAxis dataKey="name" tick={{ fill: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={{ stroke: "var(--border-default)" }} />
                <YAxis tick={{ fill: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 9 }} axisLine={{ stroke: "var(--border-default)" }} tickFormatter={v => formatCurrencyShort(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={8} wrapperStyle={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-secondary)" }} />
                {contingency > 0 && (
                  <ReferenceLine y={totalBudget + contingency} stroke="var(--status-error)" strokeDasharray="5 5" label={{ value: "Contingency Limit", fill: "var(--status-error)", fontSize: 9, fontFamily: "var(--font-mono)" }} />
                )}
                <Area type="monotone" dataKey="budget" name="Budget" stroke="var(--accent)" fill="url(#budgetGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="actual" name="Actual" stroke="var(--accent)" fill="url(#actualGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="committed" name="Committed" stroke="#FFB300" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PhoenixPanel>
      )}

      <PhoenixPanel title="Cost Code Breakdown" count={codes.length}>
        <PhoenixTable
          columns={[
            { label: "Code" }, { label: "Description" }, { label: "Category" },
            { label: "Budget", right: true }, { label: "Actual", right: true },
            { label: "Committed", right: true }, { label: "Forecast", right: true },
            { label: "Variance", right: true }, { label: "% Used" }, { label: "" },
          ]}
          loading={isLoading}
          empty="NO COST CODES"
        >
          {codes
            .filter(c => (Number(c.budget_amount) || 0) > 0 || (Number(c.actual_cost) || 0) > 0)
            .sort((a, b) => (a.cost_code_number || "").localeCompare(b.cost_code_number || ""))
            .map(c => {
              const budget = Number(c.budget_amount) || 0;
              const actual = Number(c.actual_cost) || 0;
              const committed = Number(c.committed_cost) || 0;
              const forecast = Number(c.forecast_to_complete) || 0;
              // Exposure = committed (which already includes paid amounts)
              const exposure = committed;
              const variance = exposure - budget;
              const pctUsed = budget > 0 ? (exposure / budget) * 100 : 0;
              const overContingency = contingency > 0 && variance > contingency;
              return (
                <PTR key={c.id} warn={pctUsed > 100}>
                  <PTD mono accent>{c.cost_code_number}</PTD>
                  <PTD style={{ maxWidth: 160 }}>{c.description}</PTD>
                  <PTD muted>{c.phase}</PTD>
                  <PTD right mono>{formatCurrency(budget)}</PTD>
                  <PTD right mono>{formatCurrency(actual)}</PTD>
                  <PTD right mono>{formatCurrency(committed)}</PTD>
                  <PTD right mono>{formatCurrency(forecast)}</PTD>
                  <PTD right mono bold style={{ color: variance > 0 ? "var(--status-error)" : "var(--status-success)" }}>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                      {overContingency && <ShieldAlert size={12} style={{ color: "var(--status-error)" }} />}
                      {variance > 0 ? "+" : ""}{formatCurrency(variance)}
                    </span>
                  </PTD>
                  <PTD style={{ minWidth: 100 }}>
                    <ProgressBar value={pctUsed} max={100} color={pctUsed > 100 ? "rose" : pctUsed > 80 ? "amber" : "green"} height="h-1.5" />
                  </PTD>
                  <PTD>
                    <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      {can("edit", "cost_code") && (
                        <IconButton variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingCode(c); setCodeModalOpen(true); }}><span style={{ fontSize: 11 }}>✎</span></IconButton>
                      )}
                      {can("delete", "cost_code") && (
                        <IconButton variant="ghost" size="icon" className="h-7 w-7" style={{ color: "var(--status-error)" }} onClick={() => setDeleteCodeTarget(c)}><span style={{ fontSize: 11 }}>✕</span></IconButton>
                      )}
                    </div>
                  </PTD>
                </PTR>
              );
            })}
          {codes.length > 0 && (
            <tr style={{ background: "var(--warning-muted)", borderTop: "1px solid var(--warning-border)" }}>
              <td colSpan={3} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.14em", color: "var(--accent)", fontWeight: 700, padding: "8px 12px" }}>TOTALS</td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>{formatCurrency(totalBudget)}</td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>{formatCurrency(totalActual)}</td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>{formatCurrency(totalCommitted)}</td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-primary)", fontWeight: 700, textAlign: "right", padding: "8px 12px" }}>{formatCurrency(totalForecast)}</td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textAlign: "right", padding: "8px 12px", color: totalVariance > 0 ? "var(--status-error)" : "var(--status-success)" }}>{totalVariance > 0 ? "+" : ""}{formatCurrency(totalVariance)}</td>
              <td />
            </tr>
          )}
        </PhoenixTable>
      </PhoenixPanel>

      {/* ── Margin at Risk ── */}
      <PhoenixPanel title="Margin at Risk by Cost Code" count={marginAtRisk.filter(c => c.atRisk).length} style={{ marginTop: 14 }}>
        <PhoenixTable
          columns={[
            { label: 'Code' }, { label: 'Description' }, { label: 'Phase' },
            { label: 'Budget', right: true }, { label: 'EAC', right: true },
            { label: 'Exposure', right: true }, { label: 'Risk %', right: true },
          ]}
          empty="NO MARGIN EXPOSURE"
        >
          {marginAtRisk.filter(c => c.atRisk).map(c => (
            <PTR key={c.id} warn={c.marginRisk > 20}>
              <PTD mono accent>{c.code}</PTD>
              <PTD style={{ maxWidth: 160 }}>{c.description}</PTD>
              <PTD muted>{c.phase}</PTD>
              <PTD right mono>{formatCurrency(c.budget)}</PTD>
              <PTD right mono style={{ color: c.eac > c.budget ? 'var(--status-error)' : 'var(--status-success)' }}>{formatCurrency(c.eac)}</PTD>
              <PTD right mono bold style={{ color: 'var(--status-error)' }}>+{formatCurrency(c.exposure)}</PTD>
              <PTD right mono style={{ color: c.marginRisk > 20 ? 'var(--status-error)' : 'var(--status-warning)', fontWeight: 700 }}>{c.marginRisk.toFixed(1)}%</PTD>
            </PTR>
          ))}
        </PhoenixTable>
      </PhoenixPanel>

      {/* ── CO Aging + Billing Lag ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>

        <PhoenixPanel title="CO Aging & Recovery" count={coAging.filter(c => c.isStale).length > 0 ? `${coAging.filter(c => c.isStale).length} stale` : coAging.length}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', borderBottom: '1px solid var(--divider)' }}>
            {[
              { label: 'Pending', value: cos.filter(c => ['Submitted', 'Under Review'].includes(c.status)).length, color: 'var(--status-warning)' },
              { label: 'Approved', value: cos.filter(c => c.status === 'Approved').length, color: 'var(--status-success)' },
              { label: 'Stale >30d', value: coAging.filter(c => c.isStale).length, color: coAging.filter(c => c.isStale).length > 0 ? 'var(--status-error)' : 'var(--text-muted)' },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{ padding: '12px 16px', borderRight: i < 2 ? '1px solid var(--divider)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
          {coAging.filter(c => c.isStale).slice(0, 5).map(co => (
            <div key={co.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--divider)', borderLeft: '3px solid var(--status-warning)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{co.co_number}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-primary)', marginTop: 1 }}>{co.title}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--status-warning)' }}>{co.daysOpen}d open</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: co.co_amount >= 0 ? 'var(--status-success)' : 'var(--status-error)', fontWeight: 700 }}>{formatCurrency(co.co_amount)}</div>
              </div>
            </div>
          ))}
          {coAging.filter(c => c.isStale).length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--status-success)', letterSpacing: '0.10em' }}>✓ NO STALE CHANGE ORDERS</div>
          )}
        </PhoenixPanel>

        <PhoenixPanel title="Billing Lag & Earned Value">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--divider)' }}>
            {[
              { label: 'Earned Value', value: formatCurrencyShort(billingMetrics.earnedValue), color: 'var(--accent)' },
              { label: 'Billed to Date', value: formatCurrencyShort(billingMetrics.billedToDate), color: 'var(--text-primary)' },
              { label: 'Unbilled EV', value: formatCurrencyShort(Math.max(0, billingMetrics.unbilledEV)), color: billingMetrics.unbilledEV > 0 ? 'var(--status-warning)' : 'var(--status-success)' },
              { label: 'Billing Efficiency', value: `${billingMetrics.billingEfficiency.toFixed(1)}%`, color: billingMetrics.billingEfficiency < 80 ? 'var(--status-error)' : billingMetrics.billingEfficiency < 95 ? 'var(--status-warning)' : 'var(--status-success)' },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{ padding: '12px 16px', borderRight: i % 2 === 0 ? '1px solid var(--divider)' : 'none', borderBottom: i < 2 ? '1px solid var(--divider)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Billing Completeness</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: billingMetrics.billingEfficiency < 80 ? 'var(--status-error)' : 'var(--status-success)' }}>{billingMetrics.billingEfficiency.toFixed(1)}%</span>
            </div>
            <div style={{ height: 8, background: 'var(--bg-surface-high)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, billingMetrics.billingEfficiency)}%`, background: billingMetrics.billingEfficiency < 80 ? 'var(--status-error)' : billingMetrics.billingEfficiency < 95 ? 'var(--status-warning)' : 'var(--status-success)', borderRadius: 4, transition: 'width 0.5s' }} />
            </div>
            {billingMetrics.unbilledEV > 10000 && (
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--status-warning)', fontWeight: 700, letterSpacing: '0.08em' }}>
                ⚠ {formatCurrency(billingMetrics.unbilledEV)} EARNED BUT NOT YET BILLED
              </div>
            )}
          </div>
        </PhoenixPanel>

      </div>

      {/* ── Labor Productivity ── */}
      {(productivity.shopBudget > 0 || productivity.fieldBudget > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>

          <PhoenixPanel title="Shop Fabrication Productivity">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', borderBottom: '1px solid var(--divider)' }}>
              {[
                { label: 'Budget Hrs', value: productivity.shopBudget.toLocaleString(), color: 'var(--text-primary)' },
                { label: 'Actual Hrs', value: productivity.shopActual.toLocaleString(), color: 'var(--text-primary)' },
                { label: 'Efficiency', value: `${productivity.shopEfficiency.toFixed(1)}%`, color: productivity.shopEfficiency > 110 ? 'var(--status-error)' : productivity.shopEfficiency > 95 ? 'var(--status-warning)' : 'var(--status-success)' },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ padding: '12px 16px', borderRight: i < 2 ? '1px solid var(--divider)' : 'none' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
            {productivity.completedTons > 0 && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Actual Hrs/Ton</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{productivity.shopHrsPerTon.toFixed(1)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Budget Hrs/Ton</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-muted)', marginTop: 2 }}>{productivity.budgetShopHrsPerTon.toFixed(1)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>Variance</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: productivity.shopHrsPerTon > productivity.budgetShopHrsPerTon ? 'var(--status-error)' : 'var(--status-success)', marginTop: 2 }}>{(productivity.shopHrsPerTon - productivity.budgetShopHrsPerTon).toFixed(1)}</div>
                </div>
              </div>
            )}
            {productivity.byWP.slice(0, 6).map(wp => (
              <div key={wp.name} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', padding: '7px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wp.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textAlign: 'right' }}>{wp.shopBudget}h</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-primary)', textAlign: 'right' }}>{wp.shopActual}h</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textAlign: 'right', color: wp.shopEff > 110 ? 'var(--status-error)' : wp.shopEff > 95 ? 'var(--status-warning)' : 'var(--status-success)' }}>{wp.shopEff.toFixed(0)}%</div>
              </div>
            ))}
          </PhoenixPanel>

          <PhoenixPanel title="Field Install Productivity">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', borderBottom: '1px solid var(--divider)' }}>
              {[
                { label: 'Budget Hrs', value: productivity.fieldBudget.toLocaleString(), color: 'var(--text-primary)' },
                { label: 'Actual Hrs', value: productivity.fieldActual.toLocaleString(), color: 'var(--text-primary)' },
                { label: 'Efficiency', value: `${productivity.fieldEfficiency.toFixed(1)}%`, color: productivity.fieldEfficiency > 110 ? 'var(--status-error)' : productivity.fieldEfficiency > 95 ? 'var(--status-warning)' : 'var(--status-success)' },
              ].map(({ label, value, color }, i) => (
                <div key={label} style={{ padding: '12px 16px', borderRight: i < 2 ? '1px solid var(--divider)' : 'none' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
                </div>
              ))}
            </div>
            {productivity.byWP.filter(wp => wp.fieldBudget > 0).slice(0, 6).map(wp => (
              <div key={wp.name} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px', padding: '7px 16px', borderBottom: '1px solid var(--divider)', alignItems: 'center', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wp.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', textAlign: 'right' }}>{wp.fieldBudget}h</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-primary)', textAlign: 'right' }}>{wp.fieldActual}h</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textAlign: 'right', color: wp.fieldEff > 110 ? 'var(--status-error)' : wp.fieldEff > 95 ? 'var(--status-warning)' : 'var(--status-success)' }}>{wp.fieldEff.toFixed(0)}%</div>
              </div>
            ))}
            {productivity.byWP.filter(wp => wp.fieldBudget > 0).length === 0 && (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.10em' }}>NO FIELD HOURS LOGGED YET</div>
            )}
          </PhoenixPanel>

        </div>
      )}

      {/* ── Procurement Exposure ── */}
      {procurementExposure.total > 0 && (
        <PhoenixPanel title="Procurement Exposure" count={`${procurementExposure.late} late`} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', borderBottom: '1px solid var(--divider)' }}>
            {[
              { label: 'Total Open', value: procurementExposure.total, color: 'var(--text-primary)' },
              { label: 'Overdue', value: procurementExposure.late, color: procurementExposure.late > 0 ? 'var(--status-error)' : 'var(--text-muted)' },
              { label: 'Due <30 Days', value: procurementExposure.due30, color: procurementExposure.due30 > 0 ? 'var(--status-warning)' : 'var(--text-muted)' },
              { label: 'Due 30-60 Days', value: procurementExposure.due60, color: 'var(--text-secondary)' },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{ padding: '12px 16px', borderRight: i < 3 ? '1px solid var(--divider)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
          {procurementExposure.lateItems.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--divider)', borderLeft: '3px solid var(--status-error)', background: 'var(--danger-muted)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.description || d.vendor || d.delivery_id || 'Delivery'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{d.vendor || ''}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--status-error)' }}>
                {d.scheduled_date ? `Due ${formatDateShort(d.scheduled_date)}` : 'Overdue'}
              </div>
            </div>
          ))}
          {procurementExposure.due30Items.map(d => (
            <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--divider)', borderLeft: '3px solid var(--status-warning)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{d.description || d.vendor || d.delivery_id || 'Delivery'}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{d.vendor || ''}</div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--status-warning)' }}>
                {d.scheduled_date ? formatDateShort(d.scheduled_date) : '—'}
              </div>
            </div>
          ))}
        </PhoenixPanel>
      )}

      <CostCodeFormModal
        open={codeModalOpen}
        onClose={() => { setCodeModalOpen(false); setEditingCode(null); }}
        costCode={editingCode}
        projects={projects}
        existingCodes={codes}
        onSave={(data) => {
          if (editingCode) {
            updateCodeMut.mutate({ id: editingCode.id, data });
          } else {
            createCodeMut.mutate(data);
          }
        }}
      />
      <DeleteDialog
        open={!!deleteCodeTarget}
        onClose={() => setDeleteCodeTarget(null)}
        onConfirm={() => deleteCodeMut.mutate(deleteCodeTarget.id)}
        title="Delete cost code?"
        description={`Remove ${deleteCodeTarget?.cost_code_number} — ${deleteCodeTarget?.description}?`}
      />
    </div>
  );
}
