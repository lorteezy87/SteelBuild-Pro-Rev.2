/**
 * FieldHub — consolidates the field/quality surfaces under one nav entry
 * (module-consolidation Phase 2). The Field overview already rolls up
 * Inspections / Safety / Punchlist / Quality Control KPIs; this shell adds the
 * full registers as tabs alongside it so they stop occupying separate sidebar
 * slots (and Safety/QC, deprioritized in Phase 1, stay reachable here rather
 * than URL-only).
 *
 * Thin tab shell (the DrawingSubmittalHub / ResourceHub pattern): each tab
 * lazy-loads the existing page unchanged; all remain independently routable.
 * `?field_tab=` drives the active tab.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const FieldTodayPage = lazyWithRetry(() => import("@/pages/FieldToday"));
const FieldOverview = lazyWithRetry(() => import("@/pages/Field"));
const DailyLogsPage = lazyWithRetry(() => import("@/pages/DailyLogs"));
const PhotosPage = lazyWithRetry(() => import("@/pages/Photos"));
const LEMsPage = lazyWithRetry(() => import("@/pages/LEMs"));
const InspectionsPage = lazyWithRetry(() => import("@/pages/Inspections"));
const SafetyPage = lazyWithRetry(() => import("@/pages/Safety"));
const PunchlistPage = lazyWithRetry(() => import("@/pages/Punchlist"));
const QualityControlPage = lazyWithRetry(() => import("@/pages/QualityControl"));

const TABS = [
  { key: "today", label: "Today", Component: FieldTodayPage },
  { key: "overview", label: "Overview", Component: FieldOverview },
  { key: "dailylogs", label: "Daily Logs", Component: DailyLogsPage },
  { key: "photos", label: "Photos", Component: PhotosPage },
  { key: "lems", label: "LEMs", Component: LEMsPage },
  { key: "inspections", label: "Inspections", Component: InspectionsPage },
  { key: "punchlist", label: "Punchlist", Component: PunchlistPage },
  { key: "quality", label: "Quality Control", Component: QualityControlPage },
  { key: "safety", label: "Safety", Component: SafetyPage },
];

export default function FieldHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("field_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "today";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("field_tab", key);
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
        aria-label="Field"
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
        <ErrorBoundary label="Field">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
