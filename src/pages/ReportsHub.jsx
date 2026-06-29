/**
 * ReportsHub — consolidates the reporting/audit surfaces under one nav entry
 * (module-consolidation). The Reports library (a launcher), Job Status Report,
 * Decision Log, and the Activity audit log were scattered — Job Status Report
 * and Decision Log weren't even in the sidebar. This surfaces them as tabs.
 *
 * Thin tab shell (the DrawingSubmittalHub / FieldHub / CostHub / ScheduleHub /
 * RiskHub pattern): each tab lazy-loads the existing page unchanged; all stay
 * independently routable. `?report_tab=` drives the active tab.
 *
 * command_ui flag: when enabled, replaces the tab shell with the light-theme
 * ReportsHubControlCenter. Navigating to a specific report still deep-links
 * into the existing /Reports/:slug route so individual report pages are
 * unaffected.
 */
import { Suspense, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { useFlag } from "@/hooks/useFeatureFlag";
import { REPORTS } from "@/pages/reports/registry";
import ReportsHubControlCenter from "./reportsHub/ReportsHubControlCenter";

const ReportsLibrary = lazyWithRetry(() => import("@/pages/Reports"));
const JobStatusReport = lazyWithRetry(() => import("@/pages/JobStatusReport"));
const DecisionLog = lazyWithRetry(() => import("@/pages/DecisionLog"));
const ActivityLog = lazyWithRetry(() => import("@/pages/Activity"));

const TABS = [
  { key: "library", label: "Report Library", Component: ReportsLibrary },
  { key: "job-status", label: "Job Status", Component: JobStatusReport },
  { key: "decisions", label: "Decision Log", Component: DecisionLog },
  { key: "activity", label: "Activity Log", Component: ActivityLog },
];

export default function ReportsHub() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const commandUi = useFlag("command_ui");

  // ── command_ui state (only used on the CC path) ───────────────────────────
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REPORTS.filter((r) => {
      const matchesCat =
        categoryFilter === "All" || r.category === categoryFilter;
      const matchesSearch =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [search, categoryFilter]);

  const handleOpenReport = (entry) => {
    navigate(`/Reports/${entry.slug}`);
  };

  const handleCategoryChange = (cat) => {
    setCategoryFilter(cat);
  };

  // ── command_ui path ───────────────────────────────────────────────────────
  if (commandUi) {
    return (
      <ReportsHubControlCenter
        catalog={REPORTS}
        filtered={filteredReports}
        search={search}
        onSearch={setSearch}
        categoryFilter={categoryFilter}
        onCategoryChange={handleCategoryChange}
        onOpenReport={handleOpenReport}
        favorites={[]}
      />
    );
  }

  // ── Classic tab-shell path (unchanged) ────────────────────────────────────
  const param = params.get("report_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "library";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("report_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Reports"
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
        <ErrorBoundary label="Reports">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
