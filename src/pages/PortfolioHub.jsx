/**
 * PortfolioHub — canonical Portfolio Overview shell with Executive View compatibility.
 * `?pf_tab=` drives the active tab.
 */
import { Suspense, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import PortfolioControlCenter from "./portfolio/PortfolioControlCenter";
import { useOrg } from "@/components/shared/OrgContext";
import { projectsInWorkspace, readProjectRows } from "@/lib/portfolioScope";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";

const ExecutiveView = lazyWithRetry(() => import("@/pages/ExecutiveView"));

const TABS = [
  { key: "overview", label: "Portfolio Overview" },
  { key: "executive", label: "Executive View" },
];

export default function PortfolioHub() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;

  const param = params.get("pf_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "overview";
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("pf_tab", key);
        return next;
      },
      { replace: true },
    );

  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("All");

  const fetchForCC = activeKey === "overview";

  const projectsQ = useQuery({
    queryKey: ["projects", "portfolio-all", orgId],
    queryFn: () => entities.Project.filterAll({ org_id: orgId }),
    staleTime: 5 * 60 * 1000,
    enabled: fetchForCC && !!orgId,
  });
  const projects = useMemo(
    () => projectsInWorkspace(projectsQ.data ?? [], orgId),
    [projectsQ.data, orgId],
  );
  const projectIds = useMemo(() => projects.map((project) => project.id).sort(), [projects]);
  const canReadRows = fetchForCC && !!orgId && projectsQ.isSuccess;
  const changeOrdersQ = useQuery({
    queryKey: ["portfolio-cos", orgId, projectIds],
    queryFn: () => readProjectRows(entities.ChangeOrder, projectIds),
    staleTime: 60 * 1000,
    enabled: canReadRows,
  });
  const { data: changeOrders = [] } = changeOrdersQ;
  const workPackagesQ = useQuery({
    queryKey: ["portfolio-wps", orgId, projectIds],
    queryFn: () => readProjectRows(entities.WorkPackage, projectIds),
    staleTime: 30 * 1000,
    enabled: canReadRows,
  });
  const { data: workPackages = [] } = workPackagesQ;
  const costCodesQ = useQuery({
    queryKey: ["portfolio-codes", orgId, projectIds],
    queryFn: () => readProjectRows(entities.CostCode, projectIds),
    staleTime: 60 * 1000,
    enabled: canReadRows,
  });
  const { data: costCodes = [] } = costCodesQ;
  const rfisQ = useQuery({
    queryKey: ["portfolio-rfis", orgId, projectIds],
    queryFn: () => readProjectRows(entities.RFI, projectIds),
    staleTime: 30 * 1000,
    enabled: canReadRows,
  });
  const { data: rfis = [] } = rfisQ;
  const deliveriesQ = useQuery({
    queryKey: ["portfolio-deliveries", orgId, projectIds],
    queryFn: () => readProjectRows(entities.Delivery, projectIds),
    staleTime: 30 * 1000,
    enabled: canReadRows,
  });
  const { data: deliveries = [] } = deliveriesQ;
  const actionItemsQ = useQuery({
    queryKey: ["portfolio-action-items", orgId, projectIds],
    queryFn: () => readProjectRows(entities.ActionItem, projectIds),
    staleTime: 30 * 1000,
    enabled: canReadRows,
  });
  const { data: actionItems = [] } = actionItemsQ;
  const scheduleTasksQ = useQuery({
    queryKey: ["portfolio-schedule-tasks", orgId, projectIds],
    queryFn: () => readProjectRows(entities.ScheduleTask, projectIds, "-start_date"),
    staleTime: 60 * 1000,
    enabled: canReadRows,
  });
  const { data: scheduleTasks = [] } = scheduleTasksQ;
  const expensesQ = useQuery({
    queryKey: ["portfolio-expenses", orgId, projectIds],
    queryFn: () => readProjectRows(entities.Expense, projectIds),
    staleTime: 60 * 1000,
    enabled: canReadRows,
  });
  const { data: expenses = [] } = expensesQ;
  const allQueries = [projectsQ, changeOrdersQ, workPackagesQ, costCodesQ, rfisQ, deliveriesQ, actionItemsQ, scheduleTasksQ, expensesQ];
  const isLoading = allQueries.some((query) => query.isPending);
  const failedQuery = allQueries.find((query) => query.isError);

  const related = useMemo(
    () => ({ changeOrders, workPackages, costCodes, rfis, deliveries, actionItems, scheduleTasks, expenses }),
    [changeOrders, workPackages, costCodes, rfis, deliveries, actionItems, scheduleTasks, expenses],
  );

  // Navigate to the project dashboard when a row is clicked
  const handleOpenProject = (project) => {
    navigate(`${createPageUrl("Dashboard")}?project=${project.id}`);
  };

  // The tab strip renders for every tab — it is the only way to reach the
  // Executive View, so it must not disappear on the default Overview tab.
  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Portfolio"
        className="hub-tabstrip"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "10px 24px 0",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(tab.key)}
              style={{
                minHeight: 34,
                padding: "7px 14px",
                borderRadius: 9,
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border-default)"}`,
                background: isActive
                  ? "color-mix(in srgb, var(--accent) 14%, var(--bg-surface-high))"
                  : "var(--bg-surface-low)",
                color: isActive ? "var(--accent)" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 0, position: "relative" }}>
        {activeKey === "executive" ? (
          <ErrorBoundary label="Portfolio">
            <Suspense fallback={<LoadingSkeleton variant="page" />}>
              <ExecutiveView />
            </Suspense>
          </ErrorBoundary>
        ) : !orgId ? (
          <div role="status" style={{ padding: 24 }}>Choose a workspace to load the portfolio.</div>
        ) : failedQuery ? (
          <div role="alert" style={{ padding: 24 }}>
            <p>Couldn’t load portfolio data</p>
            <p>{toUserErrorMessage(failedQuery.error, "Try again.")}</p>
            <button type="button" className="sbd-btn sbd-btn-primary" onClick={() => failedQuery.refetch()}>Retry</button>
          </div>
        ) : isLoading ? (
          <LoadingSkeleton variant="page" />
        ) : (
          <PortfolioControlCenter
            projects={projects}
            related={related}
            search={search}
            onSearch={setSearch}
            healthFilter={healthFilter}
            onHealthFilter={setHealthFilter}
            onOpenProject={handleOpenProject}
          />
        )}
      </div>
    </div>
  );
}
