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

const ExecutiveView = lazyWithRetry(() => import("@/pages/ExecutiveView"));

const TABS = [
  { key: "overview", label: "Portfolio Overview" },
  { key: "executive", label: "Executive View" },
];

export default function PortfolioHub() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

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

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.listAll(),
    staleTime: 5 * 60 * 1000,
    enabled: fetchForCC,
  });
  const { data: changeOrders = [] } = useQuery({
    queryKey: ["portfolio-cos"],
    queryFn: () => entities.ChangeOrder.listAll(),
    staleTime: 60 * 1000,
    enabled: fetchForCC,
  });
  const { data: workPackages = [] } = useQuery({
    queryKey: ["portfolio-wps"],
    queryFn: () => entities.WorkPackage.listAll(),
    staleTime: 30 * 1000,
    enabled: fetchForCC,
  });
  const { data: costCodes = [] } = useQuery({
    queryKey: ["portfolio-codes"],
    queryFn: () => entities.CostCode.listAll(),
    staleTime: 60 * 1000,
    enabled: fetchForCC,
  });
  const { data: rfis = [] } = useQuery({
    queryKey: ["portfolio-rfis"],
    queryFn: () => entities.RFI.listAll(),
    staleTime: 30 * 1000,
    enabled: fetchForCC,
  });
  const { data: deliveries = [] } = useQuery({
    queryKey: ["portfolio-deliveries"],
    queryFn: () => entities.Delivery.listAll(),
    staleTime: 30 * 1000,
    enabled: fetchForCC,
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["portfolio-action-items"],
    queryFn: () => entities.ActionItem.listAll(),
    staleTime: 30 * 1000,
    enabled: fetchForCC,
  });
  const { data: scheduleTasks = [] } = useQuery({
    queryKey: ["portfolio-schedule-tasks"],
    queryFn: () => entities.ScheduleTask.listAll("-start_date"),
    staleTime: 60 * 1000,
    enabled: fetchForCC,
  });

  const related = useMemo(
    () => ({ changeOrders, workPackages, costCodes, rfis, deliveries, actionItems, scheduleTasks }),
    [changeOrders, workPackages, costCodes, rfis, deliveries, actionItems, scheduleTasks],
  );

  // Navigate to the project dashboard when a row is clicked
  const handleOpenProject = (project) => {
    navigate(`${createPageUrl("Dashboard")}?project=${project.id}`);
  };

  if (activeKey === "overview") {
    if (projectsLoading) {
      return <LoadingSkeleton variant="page" />;
    }

    return (
      <PortfolioControlCenter
        projects={projects}
        related={related}
        search={search}
        onSearch={setSearch}
        healthFilter={healthFilter}
        onHealthFilter={setHealthFilter}
        onOpenProject={handleOpenProject}
      />
    );
  }

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Portfolio"
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
        ) : null}
      </div>
    </div>
  );
}
