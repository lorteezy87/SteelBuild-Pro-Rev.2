import React, { useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useProjectContext } from "../components/shared/useProjectContext";
import PortfolioView from "../components/dashboard/PortfolioView";
import DrilldownView from "../components/dashboard/DrilldownView";

export default function Dashboard() {
  const { activeProject, setActiveProject } = useProjectContext();
  const pid = activeProject?.id;

  // ── Portfolio-wide queries (always loaded) ──
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list(), initialData: [] });
  const { data: allRFIs = [] } = useQuery({ queryKey: ["rfis-all"], queryFn: () => base44.entities.RFI.list(), initialData: [] });
  const { data: allCOs = [] } = useQuery({ queryKey: ["cos-all"], queryFn: () => base44.entities.ChangeOrder.list(), initialData: [] });
  const { data: allCodes = [] } = useQuery({ queryKey: ["codes-all"], queryFn: () => base44.entities.CostCode.list(), initialData: [] });
  const { data: allWPs = [] } = useQuery({
    queryKey: ["work-packages"],
    queryFn: () => base44.entities.WorkPackage.list(),
    initialData: [],
    staleTime: 30000,
  });
  const { data: allDeliveries = [] } = useQuery({ queryKey: ["deliveries-all"], queryFn: () => base44.entities.Delivery.list(), initialData: [] });
  const { data: allActionItems = [] } = useQuery({ queryKey: ["action-items-all"], queryFn: () => base44.entities.ActionItem.list(), initialData: [] });
  const { data: allExpenses = [] } = useQuery({ queryKey: ["expenses-all"], queryFn: () => base44.entities.Expense.list(), initialData: [] });

  // ── Project-scoped queries (only when a project is active) ──
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings", pid],
    queryFn: () => pid ? base44.entities.Drawing.filter({ project_id: pid }) : [],
    enabled: !!pid,
    initialData: [],
    staleTime: 30000,
  });
  const { data: tasks = [] } = useQuery({ queryKey: ["schedule-tasks", pid], queryFn: () => pid ? base44.entities.ScheduleTask.filter({ project_id: pid }, "-start_date") : [], enabled: !!pid, initialData: [] });
  const { data: recentActivity = [] } = useQuery({
    queryKey: ["activity-feed", pid],
    queryFn: () => pid ? base44.entities.Activity.filter({ projectId: pid }, "-timestamp") : base44.entities.Activity.list("-timestamp"),
    initialData: [],
  });

  // Derived project-scoped slices from global data (avoids duplicate queries)
  const rfis = useMemo(() => pid ? allRFIs.filter(r => r.project_id === pid) : [], [allRFIs, pid]);
  const cos = useMemo(() => pid ? allCOs.filter(c => c.project_id === pid) : [], [allCOs, pid]);
  const codes = useMemo(() => pid ? allCodes.filter(c => c.project_id === pid) : [], [allCodes, pid]);
  const wps = useMemo(() => pid ? allWPs.filter(w => w.project_id === pid) : [], [allWPs, pid]);
  const deliveries = useMemo(() => pid ? allDeliveries.filter(d => d.project_id === pid) : [], [allDeliveries, pid]);
  const expenses = useMemo(() => pid ? allExpenses.filter(e => e.project_id === pid) : [], [allExpenses, pid]);

  if (!pid) {
    return (
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
    );
  }

  return (
    <DrilldownView
      project={activeProject}
      rfis={rfis}
      cos={cos}
      codes={codes}
      wps={wps}
      drawings={drawings}
      tasks={tasks}
      actionItems={allActionItems.filter(a => a.project_id === pid)}
      deliveries={deliveries}
      expenses={expenses}
      recentActivity={recentActivity}
      onClearProject={() => setActiveProject(null)}
    />
  );
}
