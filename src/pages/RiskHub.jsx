/**
 * RiskHub — consolidates the fabrication risk/exception surfaces under one nav
 * entry (module-consolidation). Margin Risk (dollar exposure via
 * marginRiskEngine) and Constraints (operational blockers via constraintEngine)
 * read an overlapping source set (RFIs, submittals, deliveries, schedule tasks,
 * work packages) but produce different outputs — they're naturally viewed
 * together as "what's at risk / what's blocked."
 *
 * Thin tab shell (the DrawingSubmittalHub / FieldHub / CostHub / ScheduleHub
 * pattern): each tab lazy-loads the existing page unchanged; both stay
 * independently routable. `?risk_tab=` drives the active tab.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const MarginRiskPage = lazyWithRetry(() => import("@/pages/MarginRisk"));
const ConstraintsPage = lazyWithRetry(() => import("@/pages/Constraints"));

const TABS = [
  { key: "margin", label: "Margin Risk", Component: MarginRiskPage },
  { key: "constraints", label: "Constraints", Component: ConstraintsPage },
];

export default function RiskHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("risk_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "margin";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("risk_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div
      className="sb-dashboard-reference-page"
      style={{ display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      <div
        role="tablist"
        aria-label="Risk"
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
        <ErrorBoundary label="Risk">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
