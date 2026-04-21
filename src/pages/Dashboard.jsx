import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import PortfolioView from "../components/dashboard/PortfolioView";
import ProjectDashboard from "./dashboard/ProjectDashboard";

/**
 * Dashboard — portfolio-or-single-project orchestrator.
 *
 * Routes the user to one of two views based on whether a project is
 * currently "active" (selected in the project switcher):
 *   - no project  → `<PortfolioView>` (all projects summary)
 *   - project set → `<ProjectDashboard>` (the new industrial-OS
 *                    single-project dashboard)
 *
 * `ProjectDashboard` replaced the legacy `DrilldownView` component as
 * part of the Claude Design redesign rollout. The old component still
 * lives at `src/components/dashboard/DrilldownView.jsx` for reference
 * but is no longer rendered.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { activeProject, setActiveProject } = useProjectContext();
  const pid = activeProject?.id;

  /* ── Portfolio-wide queries (always loaded) ── */
  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: allRFIs = [], isLoading: rfisLoading } = useQuery({
    queryKey: ["rfis"],
    queryFn: () => base44.entities.RFI.list(),
  });
  const { data: allCOs = [] } = useQuery({
    queryKey: ["cos-all"],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });
  const { data: allCodes = [] } = useQuery({
    queryKey: ["codes-all"],
    queryFn: () => base44.entities.CostCode.list(),
  });
  const { data: allWPs = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
    staleTime: 30000,
  });
  const { data: allDeliveries = [] } = useQuery({
    queryKey: ["deliveries-all"],
    queryFn: () => base44.entities.Delivery.list(),
  });
  const { data: allActionItems = [] } = useQuery({
    queryKey: ["action-items-all"],
    queryFn: () => base44.entities.ActionItem.list(),
  });
  const { data: allExpenses = [] } = useQuery({
    queryKey: ["expenses-all"],
    queryFn: () => base44.entities.Expense.list(),
  });

  /* ── Project-scoped slices (derived from global data to avoid dupe queries) ── */
  const rfis       = useMemo(() => (pid ? allRFIs.filter((r)       => r.project_id === pid) : []), [allRFIs, pid]);
  const cos        = useMemo(() => (pid ? allCOs.filter((c)        => c.project_id === pid) : []), [allCOs, pid]);
  const codes      = useMemo(() => (pid ? allCodes.filter((c)      => c.project_id === pid) : []), [allCodes, pid]);
  const wps        = useMemo(() => (pid ? allWPs.filter((w)        => w.project_id === pid) : []), [allWPs, pid]);
  const deliveries = useMemo(() => (pid ? allDeliveries.filter((d) => d.project_id === pid) : []), [allDeliveries, pid]);
  const expenses   = useMemo(() => (pid ? allExpenses.filter((e)   => e.project_id === pid) : []), [allExpenses, pid]);
  const actionItems = useMemo(
    () => (pid ? allActionItems.filter((a) => a.project_id === pid) : []),
    [allActionItems, pid]
  );

  const isLoading = projectsLoading || rfisLoading;

  if (isLoading) {
    return <LoadingSkeleton variant="page" />;
  }

  if (!pid) {
    return (
      <ErrorBoundary label="Portfolio Dashboard">
        <PortfolioView
          projects={projects}
          allRFIs={allRFIs}
          allCOs={allCOs}
          allCodes={allCodes}
          allWPs={allWPs}
          allDeliveries={allDeliveries}
          allActionItems={allActionItems}
          allExpenses={allExpenses}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary label="Project Dashboard">
      <ProjectDashboard
        project={activeProject}
        rfis={rfis}
        cos={cos}
        codes={codes}
        wps={wps}
        deliveries={deliveries}
        actionItems={actionItems}
        expenses={expenses}
        onClearProject={() => setActiveProject(null)}
        onNavigate={(target) => {
          const paths = {
            rfis:            "/RFIs",
            "work-packages": "/WorkPackages",
            deliveries:      "/Deliveries",
          };
          const path = paths[target];
          if (path) navigate(path);
        }}
      />
    </ErrorBoundary>
  );
}
