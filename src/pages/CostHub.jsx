/**
 * CostHub — consolidates "Budget Control" (Financials) and "Cost Dashboard"
 * (CostDashboard) under one nav entry (module-consolidation Phase 3). The two
 * were separate cost surfaces over the same cost-code data; this puts them
 * side-by-side as tabs.
 *
 * Thin tab shell (the DrawingSubmittalHub / ResourceHub / FieldHub pattern):
 * each tab lazy-loads the existing page unchanged; both stay independently
 * routable. `?cost_tab=` drives the active tab. NOTE: the shared cost-code
 * total rollup is centralized in src/services/costRollup.ts — but the two pages
 * keep their distinct per-row models (Budget Control derives actual/committed
 * from expenses; Cost Dashboard reads the denormalized columns), so this is a
 * navigation merge, not a math merge.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const BudgetControl = lazyWithRetry(() => import("@/pages/Financials"));
const CostDashboard = lazyWithRetry(() => import("@/pages/CostDashboard"));

const TABS = [
  { key: "budget", label: "Budget Control", Component: BudgetControl },
  { key: "dashboard", label: "Cost Dashboard", Component: CostDashboard },
];

export default function CostHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("cost_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "budget";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("cost_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Cost"
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
        <ErrorBoundary label="Cost">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
