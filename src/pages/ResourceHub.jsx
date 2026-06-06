/**
 * ResourceHub — consolidates "Resource Register" (ResourceManagement) and
 * "Crew Schedule" (ResourceScheduling) under one nav entry, so the two
 * resource surfaces stop competing for sidebar space (module-consolidation
 * Phase 2). This is a thin tab shell: it lazy-loads the existing pages as tab
 * panels (the DrawingSubmittalHub pattern) and changes neither page's logic.
 * Both remain independently routable for deep-links.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const ResourceRegister = lazyWithRetry(() => import("@/pages/ResourceManagement"));
const CrewSchedule = lazyWithRetry(() => import("@/pages/ResourceScheduling"));

const TABS = [
  { key: "register", label: "Resource Register" },
  { key: "schedule", label: "Crew Schedule" },
];

export default function ResourceHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("res_tab");
  const activeTab = TABS.some((t) => t.key === param) ? param : "register";
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("res_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Slim tab strip — switches between the two resource surfaces */}
      <div
        role="tablist"
        aria-label="Resources"
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "10px 24px 0",
          flexWrap: "wrap",
        }}
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
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
        <ErrorBoundary label="Resources">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            {activeTab === "register" ? <ResourceRegister /> : <CrewSchedule />}
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
