/**
 * CalculatorsHub — consolidates the five steel calculators under one Tools nav
 * entry (leaner-nav consolidation, 2026-06-13). The regular, feet/inches, steel
 * weight, crane pick, and decimal/fraction calculators were five separate
 * sidebar slots; this puts them side-by-side as tabs.
 *
 * Thin tab shell (the ScheduleHub / FieldHub pattern): each tab lazy-loads the
 * existing page unchanged; all stay independently routable. `?calc_tab=` drives
 * the active tab.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const RegularCalc = lazyWithRetry(() => import("@/pages/RegularCalculator"));
const FeetInchesCalc = lazyWithRetry(() => import("@/pages/FeetInchesCalculator"));
const SteelWeightCalc = lazyWithRetry(() => import("@/pages/SteelWeightCalculator"));
const CranePickCalc = lazyWithRetry(() => import("@/pages/CranePickCalculator"));
const DecimalFractionConv = lazyWithRetry(() => import("@/pages/DecimalFractionConverter"));

const TABS = [
  { key: "calculator", label: "Calculator", Component: RegularCalc },
  { key: "feetinches", label: "Ft / In", Component: FeetInchesCalc },
  { key: "steelweight", label: "Steel Weight", Component: SteelWeightCalc },
  { key: "cranepick", label: "Crane Pick", Component: CranePickCalc },
  { key: "decimalfraction", label: "Decimal / Fraction", Component: DecimalFractionConv },
];

export default function CalculatorsHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("calc_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "calculator";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("calc_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Calculators"
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
        <ErrorBoundary label="Calculators">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
