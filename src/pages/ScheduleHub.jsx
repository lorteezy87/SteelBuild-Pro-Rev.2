/**
 * ScheduleHub — consolidates the schedule surfaces under one nav entry
 * (module-consolidation). Schedule (schedule_tasks authority), the Look-Ahead
 * planner (LookAhead entity), and the multi-entity Project Calendar were three
 * separate nav entries spread across the PM/Production groups; this puts them
 * side-by-side as tabs.
 *
 * Thin tab shell (the DrawingSubmittalHub / FieldHub / CostHub pattern): each
 * tab lazy-loads the existing page unchanged; all stay independently routable.
 * `?sched_tab=` drives the active tab.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const SchedulePage = lazyWithRetry(() => import("@/pages/Schedule"));
const LookAheadPage = lazyWithRetry(() => import("@/pages/LookAheadSchedule"));
const CalendarPage = lazyWithRetry(() => import("@/pages/ProjectCalendar"));

const TABS = [
  { key: "schedule", label: "Schedule", Component: SchedulePage },
  { key: "lookahead", label: "Look-Ahead", Component: LookAheadPage },
  { key: "calendar", label: "Calendar", Component: CalendarPage },
];

export default function ScheduleHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("sched_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "schedule";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("sched_tab", key);
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
        aria-label="Schedule"
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
        <ErrorBoundary label="Schedule">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
