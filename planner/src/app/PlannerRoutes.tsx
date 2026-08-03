import { lazy, Suspense, type ReactNode } from "react";
import { Link, Route, Routes } from "react-router-dom";
import PlannerShell from "@planner/components/shell/PlannerShell";
import { PLANNER_NAV_ITEMS, PLANNER_NAV_PATHS, type PlannerNavLabel } from "@planner/components/shell/plannerNav";
const TaskRegisterPage = lazy(() => import("@planner/pages/TaskRegisterPage"));
const ArchivePage = lazy(() => import("@planner/pages/ArchivePage"));
const CommandCenterPage = lazy(() => import("@planner/pages/CommandCenterPage"));
const MyDayPage = lazy(() => import("@planner/pages/MyDayPage"));
const CalendarPage = lazy(() => import("@planner/pages/CalendarPage"));
const WaitingOnPage = lazy(() => import("@planner/pages/WaitingOnPage"));
const Gate48HourPage = lazy(() => import("@planner/pages/Gate48HourPage"));
const Lookahead10DayPage = lazy(() => import("@planner/pages/Lookahead10DayPage"));
const MilestonesPage = lazy(() => import("@planner/pages/MilestonesPage"));

function PlannerComingNextRoute({ label }: { label: PlannerNavLabel }) {
  return (
    <PlannerShell>
      <section className="planner-workspace" aria-labelledby="planner-workspace-heading">
        <h2 id="planner-workspace-heading">{label}</h2>
        <p>This Planner view is coming next. Its operational workflow is not included in the current core slice.</p>
      </section>
    </PlannerShell>
  );
}

function TaskRegisterRoute() {
  return (
    <PlannerShell>
      <Suspense fallback={<p role="status">Loading Task Register…</p>}><TaskRegisterPage /></Suspense>
    </PlannerShell>
  );
}

function ArchiveRoute() { return <PlannerShell><Suspense fallback={<p role="status">Loading Archive…</p>}><ArchivePage /></Suspense></PlannerShell>; }

function CoreRoute({ children, fallback }: { children: ReactNode; fallback: string }) {
  return <PlannerShell><Suspense fallback={<p role="status">Loading {fallback}…</p>}>{children}</Suspense></PlannerShell>;
}

function coreRouteFor(label: PlannerNavLabel) {
  switch (label) {
    case "Command Center": return <CoreRoute fallback="Command Center"><CommandCenterPage /></CoreRoute>;
    case "My Day": return <CoreRoute fallback="My Day"><MyDayPage /></CoreRoute>;
    case "Calendar": return <CoreRoute fallback="Calendar"><CalendarPage /></CoreRoute>;
    case "Waiting On": return <CoreRoute fallback="Waiting On"><WaitingOnPage /></CoreRoute>;
    case "48-Hour Gate": return <CoreRoute fallback="48-Hour Gate"><Gate48HourPage /></CoreRoute>;
    case "10-Day Lookahead": return <CoreRoute fallback="10-Day Lookahead"><Lookahead10DayPage /></CoreRoute>;
    case "Milestones": return <CoreRoute fallback="Milestones"><MilestonesPage /></CoreRoute>;
    default: return null;
  }
}

function PlannerNotFoundRoute() {
  return (
    <PlannerShell>
      <section className="planner-workspace" aria-labelledby="planner-not-found-heading">
        <h1 id="planner-not-found-heading">Planner page not found</h1>
        <p>The requested Planner page is not available.</p>
        <Link to="/">Return to Planner home</Link>
      </section>
    </PlannerShell>
  );
}

/** Route boundary for the independently built Planner application. */
export default function PlannerRoutes() {
  return (
    <Routes>
      {PLANNER_NAV_ITEMS.map((label) => (
        <Route
          key={label}
          path={PLANNER_NAV_PATHS[label]}
          element={label === "Task Register" ? <TaskRegisterRoute /> : label === "Archive" ? <ArchiveRoute /> : coreRouteFor(label) ?? <PlannerComingNextRoute label={label} />}
        />
      ))}
      <Route path="*" element={<PlannerNotFoundRoute />} />
    </Routes>
  );
}
