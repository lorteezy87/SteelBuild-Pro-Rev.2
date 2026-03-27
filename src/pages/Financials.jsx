import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import BudgetOverviewChart from "@/components/financials/BudgetOverviewChart";
import CostCodeBreakdown from "@/components/financials/CostCodeBreakdown";
import ProjectBudgetCard from "@/components/financials/ProjectBudgetCard";

export default function Financials() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [filterPhase, setFilterPhase] = useState("all");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: costCodes = [] } = useQuery({
    queryKey: ["cost-codes", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.CostCode.filter({ project_id: projectId })
        : [],
    enabled: !!projectId,
    initialData: [],
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ["change-orders", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ChangeOrder.filter({ project_id: projectId })
        : [],
    enabled: !!projectId,
    initialData: [],
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.Expense.filter({ project_id: projectId })
        : [],
    enabled: !!projectId,
    initialData: [],
  });

  const selectedProject = projectId
    ? projects.find((p) => p.id === projectId)
    : null;

  // Summary calculations
  const summary = useMemo(() => {
    const filtered =
      filterPhase === "all"
        ? costCodes
        : costCodes.filter((cc) => cc.phase === filterPhase);

    const activeExpenses = expenses.filter((expense) => expense.payment_status !== "Voided");
    const matchingCostCodes = new Set(filtered.map((cc) => cc.cost_code));
    const scopedExpenses =
      filterPhase === "all"
        ? activeExpenses
        : activeExpenses.filter((expense) => matchingCostCodes.has(expense.cost_code));

    const budgetTotal = filtered.reduce((sum, cc) => sum + (cc.budget_amount || 0), 0);
    const actualTotal = scopedExpenses
      .filter((expense) => expense.payment_status === "Paid")
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const committedTotal = scopedExpenses.reduce(
      (sum, expense) => sum + (Number(expense.amount) || 0),
      0
    );
    const variance = budgetTotal - actualTotal;
    const variancePercent = budgetTotal > 0 ? ((variance / budgetTotal) * 100).toFixed(1) : 0;

    const approvedCOs = changeOrders.filter((co) => co.status === "Approved");
    const totalCOAmount = approvedCOs.reduce((sum, co) => sum + (co.co_amount || 0), 0);

    return {
      budget: budgetTotal,
      actual: actualTotal,
      committed: committedTotal,
      variance,
      variancePercent,
      coAmount: totalCOAmount,
      forecast: actualTotal + committedTotal,
    };
  }, [costCodes, changeOrders, expenses, filterPhase]);

  const displayCostCodes = useMemo(() => {
    return costCodes.map((costCode) => {
      const relatedExpenses = expenses.filter(
        (expense) =>
          expense.payment_status !== "Voided" &&
          expense.cost_code === costCode.cost_code
      );

      const actual_cost = relatedExpenses
        .filter((expense) => expense.payment_status === "Paid")
        .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

      const committed_cost = relatedExpenses.reduce(
        (sum, expense) => sum + (Number(expense.amount) || 0),
        0
      );

      return {
        ...costCode,
        actual_cost,
        committed_cost,
      };
    });
  }, [costCodes, expenses]);

  const phases = ["Detailing", "Shop Fab", "Field Erection", "Subcontractor", "Equipment", "Overhead", "Materials"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 24,
            fontWeight: 800,
            color: "var(--text-primary)",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          Budget Control
        </h1>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            fontWeight: 700,
            color: "var(--text-muted)",
            marginTop: 4,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          {selectedProject ? selectedProject.name : "All Projects"} • Cost Analysis
        </p>
      </div>

      {/* Summary Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
        <StatCard
          label="Budget"
          value={`$${(summary.budget / 1000).toFixed(0)}K`}
          color="var(--text-muted)"
        />
        <StatCard
          label="Actual"
          value={`$${(summary.actual / 1000).toFixed(0)}K`}
          color="var(--accent)"
        />
        <StatCard
          label="Forecast"
          value={`$${(summary.forecast / 1000).toFixed(0)}K`}
          color="var(--status-warning)"
        />
        <StatCard
          label="Variance"
          value={`${summary.variancePercent}%`}
          color={summary.variance >= 0 ? "var(--status-success)" : "var(--status-error)"}
        />
        <StatCard
          label="Change Orders"
          value={`$${(summary.coAmount / 1000).toFixed(0)}K`}
          color="var(--status-info)"
        />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <BudgetOverviewChart summary={summary} />
        <ProjectBudgetCard project={selectedProject} summary={summary} />
      </div>

      {/* Phase Filter */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {["all", ...phases].map((phase) => (
          <button
            key={phase}
            onClick={() => setFilterPhase(phase)}
            style={{
              background: filterPhase === phase ? "var(--accent)" : "var(--bg-surface-low)",
              color: filterPhase === phase ? "white" : "var(--text-secondary)",
              border: "none",
              borderRadius: "var(--radius-btn)",
              padding: "5px 12px",
              fontFamily: "var(--font-body)",
              fontSize: "9px",
              fontWeight: 700,
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {phase === "all" ? "All Phases" : phase}
          </button>
        ))}
      </div>

      {/* Cost Codes Table */}
      <CostCodeBreakdown
        costCodes={
          filterPhase === "all"
            ? displayCostCodes
            : displayCostCodes.filter((cc) => cc.phase === filterPhase)
        }
      />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "none",
        borderRadius: "var(--radius-card)",
        padding: "12px",
        borderTop: `2px solid ${color}`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "16px",
          fontWeight: 600,
          color: color,
          marginBottom: "4px",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: "8px",
          fontWeight: 700,
          color: "var(--text-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}
