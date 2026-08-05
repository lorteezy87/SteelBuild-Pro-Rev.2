/**
 * ProjectsHub — consolidates the project record + its setup pages under one nav
 * entry (leaner-nav consolidation, 2026-06-13). Projects (the list/record),
 * Scope & Exclusions, Contacts, and Project Members were four separate sidebar
 * slots; this puts them side-by-side as tabs.
 *
 * Thin tab shell (the ScheduleHub / FieldHub pattern): each tab lazy-loads the
 * existing page unchanged; all stay independently routable. `?proj_tab=` drives
 * the active tab.
 */
import { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { lazyWithRetry } from "@/lib/lazyRetry";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";

const ProjectsPage = lazyWithRetry(() => import("@/pages/Projects"));
const ScopePage = lazyWithRetry(() => import("@/pages/ScopeExclusions"));
const ContactsPage = lazyWithRetry(() => import("@/pages/Contacts"));
const MembersPage = lazyWithRetry(() => import("@/pages/ProjectMembers"));

const TABS = [
  { key: "projects", label: "Projects", Component: ProjectsPage },
  { key: "scope", label: "Scope & Exclusions", Component: ScopePage },
  { key: "contacts", label: "Contacts", Component: ContactsPage },
  { key: "members", label: "Members", Component: MembersPage },
];

export default function ProjectsHub() {
  const [params, setParams] = useSearchParams();
  const param = params.get("proj_tab");
  const activeKey = TABS.some((t) => t.key === param) ? param : "projects";
  const Active = (TABS.find((t) => t.key === activeKey) || TABS[0]).Component;
  const setTab = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("proj_tab", key);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div
        role="tablist"
        aria-label="Projects"
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
        <ErrorBoundary label="Projects">
          <Suspense fallback={<LoadingSkeleton variant="page" />}>
            <Active />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
}
