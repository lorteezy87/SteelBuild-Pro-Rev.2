import React, { useMemo } from "react";
import ProjectCommandStrip from "./ProjectCommandStrip";
import SteelExecutionStatusCard from "./SteelExecutionStatusCard";
import CriticalActionsCard from "./CriticalActionsCard";
import ProjectDetailsCard from "./ProjectDetailsCard";
import FinancialSnapshotCard from "./FinancialSnapshotCard";
import FabShipmentProgressCard from "./FabShipmentProgressCard";
import LaborBurnCard from "./LaborBurnCard";
import EVMCard from "./EVMCard";
import UpcomingDeliveriesCard from "./UpcomingDeliveriesCard";
import DrawingApprovalStatusCard from "./DrawingApprovalStatusCard";
import ErectionLookaheadCard from "./ErectionLookaheadCard";
import RFIStatusChart from "./RFIStatusChart";
import BudgetOverviewChart from "../financials/BudgetOverviewChart";

function SectionLabel({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0 10px 0" }}>
      <div style={{ width: 3, height: 14, background: "var(--accent)", borderRadius: 2, flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}

export default function DrilldownView({ project, rfis, cos, codes, wps, drawings, tasks, actionItems, deliveries, expenses, recentActivity, onClearProject }) {

  const financials = useMemo(() => {
    const contractValue = Number(project.original_contract_value) || 0;
    const approvedCOVal = cos.filter(c => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    const revisedValue = contractValue + approvedCOVal;
    const budgetCommitted = codes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
    const actualSpend = codes.reduce((s, c) => s + (Number(c.actual_cost) || 0), 0);
    const committedCosts = codes.reduce((s, c) => s + (Number(c.committed_cost) || 0), 0);
    const pendingCOVal = cos.filter(c => ["Submitted", "Under Review"].includes(c.status)).reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
    return { contractValue, approvedCOVal, revisedValue, budgetCommitted, actualSpend, committedCosts, pendingCOVal };
  }, [project, cos, codes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── ROW 1: Project Command Strip ── */}
      <ProjectCommandStrip
        project={project}
        wps={wps}
        cos={cos}
        financials={financials}
        onClearProject={onClearProject}
      />

      {/* ── ROW 2: Main Command Center — 3 columns (5/4/3) ── */}
      <SectionLabel label="EXECUTION STATUS" />
      <div style={{ display: "grid", gridTemplateColumns: "5fr 4fr 3fr", gap: 14, alignItems: "stretch" }}>
        <SteelExecutionStatusCard wps={wps} drawings={drawings} />
        <CriticalActionsCard rfis={rfis} cos={cos} wps={wps} deliveries={deliveries} drawings={drawings} actionItems={actionItems} />
        <ProjectDetailsCard project={project} wps={wps} />
      </div>

      {/* ── ROW 3: Secondary Operations — 3 equal columns ── */}
      <SectionLabel label="OPERATIONS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "stretch" }}>
        <FinancialSnapshotCard financials={financials} cos={cos} />
        <FabShipmentProgressCard wps={wps} />
        <LaborBurnCard wps={wps} />
      </div>

      {/* ── ROW 4: EVM Performance ── */}
      <SectionLabel label="PERFORMANCE" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "stretch" }}>
        <EVMCard wps={wps} project={project} />
        <UpcomingDeliveriesCard deliveries={deliveries} />
      </div>

      {/* ── ROW 5: Operations / Lookahead — 3 columns ── */}
      <SectionLabel label="FIELD READINESS" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, alignItems: "stretch" }}>
        <DrawingApprovalStatusCard drawings={drawings} />
        <ErectionLookaheadCard wps={wps} deliveries={deliveries} drawings={drawings} tasks={tasks} />
        <RFIStatusChart rfis={rfis} />
      </div>

      {/* ── ROW 6: Budget Overview Chart ── */}
      <SectionLabel label="FINANCIAL OVERVIEW" />
      <BudgetOverviewChart
        summary={{
          budget: financials.budgetCommitted,
          actual: financials.actualSpend,
          forecast: financials.committedCosts,
        }}
      />

    </div>
  );
}