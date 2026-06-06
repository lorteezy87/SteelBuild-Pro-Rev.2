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
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const PortfolioOverview = lazyWithRetry(() => import("@/pages/AIInsights"));
const ExecutiveView = lazyWithRetry(() => import("@/pages/ExecutiveView"));

const TABS = [
  { key: "overview", label: "Portfolio Overview", Component: PortfolioOverview },
  { key: "executive", label: "Executive View", Component: ExecutiveView },
];

export default function PortfolioHub() {
  const [params, setParams] = useSearchParams();
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
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
