/**
 * PortfolioHub — consolidates the two portfolio-level analytics cockpits,
 * "Portfolio Overview" (AIInsights) and "Executive View" (ExecutiveView), under
 * one nav entry (module-consolidation Phase 2). Both compute portfolio rollups
 * over the same entity set, so they belong side-by-side rather than as two
 * separate modules.
 *
 * Thin tab shell (the DrawingSubmittalHub / ResourceHub / FieldHub pattern):
 * each tab lazy-loads the existing page unchanged; both stay independently
 * routable. `?pf_tab=` drives the active tab.
 *
 * Flag-branch: when `command_ui` is enabled, the "overview" tab renders
 * PortfolioControlCenter (light Command UI skin) instead of the classic
 * AIInsights page. Data is fetched here so the classic path is untouched.
 */
import { Suspense, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { useFlag } from "@/hooks/useFeatureFlag";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import PortfolioControlCenter from "./portfolio/PortfolioControlCenter";

const PortfolioOverview = lazyWithRetry(() => import("@/pages/AIInsights"));
const ExecutiveView = lazyWithRetry(() => import("@/pages/ExecutiveView"));

const TABS = [
  { key: "overview", label: "Portfolio Overview", Component: PortfolioOverview },
  { key: "executive", label: "Executive View", Component: ExecutiveView },
];

export default function PortfolioHub() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const commandUi = useFlag("command_ui");

  const param = params.get("pf_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "overview";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("pf_tab", key);
        return next;
      },
      { replace: true },
    );

  // ── command_ui data (fetched only when flag is on and overview tab is active) ──
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("All");

  const fetchForCC = commandUi && activeKey === "overview";

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

  const related = useMemo(
    () => ({ changeOrders, workPackages, costCodes, rfis, deliveries }),
    [changeOrders, workPackages, costCodes, rfis, deliveries],
  );

  // Navigate to the project dashboard when a row is clicked
  const handleOpenProject = (project) => {
    navigate(`${createPageUrl("Dashboard")}?project=${project.id}`);
  };

  // ── command_ui overview branch ──
  if (commandUi && activeKey === "overview") {
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

  // ── Classic tab shell (unchanged) ──
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
        <ErrorBoundary label="Portfolio">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
