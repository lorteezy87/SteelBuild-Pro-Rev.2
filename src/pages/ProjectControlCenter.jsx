import React, { useMemo, useState } from "react";
import { useProjectControlCenterData } from "@/components/project-control-center/useProjectControlCenterData";
import {
  ControlCenterHeader,
  KeyMetricsPanel,
  OverdueItemsPanel,
  PrioritiesPanel,
  RecentRevisionsPanel,
  RecommendedActionsPanel,
  RiskWatchlistPanel,
  WaitingOnPanel,
} from "@/components/project-control-center/ProjectControlCenterSections";

function matchesFilter(item, filters) {
  if (filters.severity !== "All" && item.severity !== filters.severity) return false;
  if (filters.phase !== "All" && item.phase !== filters.phase) return false;
  if (filters.owner !== "All" && item.owner !== filters.owner) return false;
  if (filters.status !== "All" && item.status !== filters.status && item.mitigationStatus !== filters.status) return false;
  return true;
}

export default function ProjectControlCenter() {
  const [filters, setFilters] = useState({
    severity: "All",
    phase: "All",
    owner: "All",
    status: "All",
  });

  const {
    activeProject,
    isLoading,
    isError,
    priorities,
    risks,
    waitingOn,
    recommendedActions,
    metrics,
    recentRevisions,
    overdueItems,
  } = useProjectControlCenterData();

  const filteredPriorities = useMemo(() => priorities.filter((item) => matchesFilter(item, filters)), [priorities, filters]);
  const filteredRisks = useMemo(() => risks.filter((item) => matchesFilter(item, filters)), [risks, filters]);
  const filteredWaitingOn = useMemo(() => waitingOn.filter((item) => filters.phase === "All" || item.phase === filters.phase), [waitingOn, filters.phase]);

  if (!activeProject) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            Project Control Center
          </div>
          <h1 style={{ margin: 0, color: "var(--text-primary)" }}>Select a project to open the control center.</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>This workspace is project-scoped. Pick an active project from the project pill in the header first.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            Project Control Center
          </div>
          <h1 style={{ margin: 0, color: "var(--text-primary)" }}>Loading live project controls…</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>Gathering RFIs, revisions, work packages, deliveries, cost exposure, schedule tasks, and constraints for {activeProject.name}.</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: "rgba(255,61,61,0.08)", border: "1px solid var(--status-error)", borderRadius: "var(--radius-card)", padding: 24 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--status-error)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
            Project Control Center
          </div>
          <h1 style={{ margin: 0, color: "var(--text-primary)" }}>Project control data could not be loaded.</h1>
          <p style={{ color: "var(--text-secondary)", marginTop: 12 }}>The control center is deterministic, but it still depends on the live project records loading successfully. Retry the page and confirm the active project is valid.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 8 }}>
      <ControlCenterHeader projectName={activeProject.name} filters={filters} setFilters={setFilters} />

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.2fr 0.9fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 16 }}>
          <PrioritiesPanel items={filteredPriorities} />
          <RecommendedActionsPanel items={recommendedActions} />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <RiskWatchlistPanel items={filteredRisks} />
          <WaitingOnPanel items={filteredWaitingOn} />
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <KeyMetricsPanel metrics={metrics} />
          <RecentRevisionsPanel items={recentRevisions} />
          <OverdueItemsPanel items={overdueItems} />
        </div>
      </div>
    </div>
  );
}
