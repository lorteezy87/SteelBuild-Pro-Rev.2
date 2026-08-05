/**
 * CalculatorsHub — consolidates the five steel calculators under one Tools nav
 * entry (leaner-nav consolidation, 2026-06-13). The regular, feet/inches, steel
 * weight, crane pick, and decimal/fraction calculators were five separate
 * sidebar slots; this puts them side-by-side as tabs.
 *
 * Device shell (2026-06-27 calculator redesign): the bespoke tab bar is replaced
 * by the shared <CalculatorShell> — a tactile device frame + segmented tool rail
 * (with arrow-key navigation). Each tool still lazy-loads its existing page
 * unchanged and stays independently routable; `?calc_tab=` drives the active
 * tool. The active tool renders inside the shell body.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import CalculatorShell from "@/components/calculators/CalculatorShell";

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

// The tool rail wants {id, label}; our canonical key IS the id (preserve the
// exact ?calc_tab= deep-link keys).
const RAIL_TOOLS = TABS.map((t) => ({ id: t.key, label: t.label }));

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
    <div className="sb-dashboard-reference-page">
    <CalculatorShell tools={RAIL_TOOLS} activeTool={activeKey} onSelect={setTab}>
      <ErrorBoundary label="Calculators">
        <Suspense fallback={<LoadingSkeleton variant="page" />}>
          <Active />
        </Suspense>
      </ErrorBoundary>
    </CalculatorShell>
    </div>
  );
}
