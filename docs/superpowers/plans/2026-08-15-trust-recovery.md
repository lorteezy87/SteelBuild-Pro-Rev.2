# SteelBuild Pro Trust Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new-user onboarding, RFI portfolio totals, project health, and Field Today present one evidence-backed operational truth.

**Architecture:** Add pure domain helpers for field-task partitioning, operational health, RFI portfolio scoping, and auth signup outcomes. Page shells remain the data/mutation owners; control-center components consume derived results and never reinterpret missing data as zero. Existing Supabase tables, RLS policies, and invitation RPCs remain authoritative and unchanged.

**Tech Stack:** React 18, TypeScript/JavaScript, TanStack Query, Vitest, Testing Library, Supabase Auth/Postgres, Vite.

## Global Constraints

- Team is the only supported workspace invitation and membership surface.
- Project access remains an explicit assignment after workspace acceptance.
- Portfolio RFI aggregation includes active, non-deleted, non-held projects visible through RLS.
- Any overdue RFI or overdue leaf schedule task prevents effective health `On Track`.
- Any critical overdue RFI, three overdue RFIs, or five overdue leaf schedule tasks produces effective health `At Risk`.
- Missing health evidence is partial, never silently zero.
- Today’s Tasks contains only work due today or proven active in a dated window containing today.
- Recovery backlog, planning gaps, and upcoming work never inflate Today’s Tasks.
- Completed Today displays unavailable until a real completion timestamp exists.
- Do not add a database migration or mutate production records.
- Preserve protected Supabase/RLS boundaries and existing `accept_invitation` RPC behavior.

---

## File Structure

- `src/lib/field/fieldToday.js`: canonical leaf-task partition and sorting.
- `src/lib/projectHealth.ts`: canonical operational health thresholds and row-to-evidence index.
- `src/pages/rfis/rfiPortfolioScope.ts`: portfolio child-row filtering through visible project IDs.
- `src/lib/auth/signupOutcome.ts`: Supabase signup classification and invite-aware redirect URLs.
- `src/pages/fieldToday/fieldTodayControlCenter.derive.ts`: Field Today KPIs and queues from task partitions.
- `src/pages/dashboardCC/dashboardControlCenter.derive.ts`: dashboard score capped by operational health.
- `src/pages/projects/projectsControlCenter.derive.ts`: portfolio health counts and queues from effective health.
- `src/pages/RFIs.jsx`, `src/pages/Dashboard.jsx`, `src/pages/Projects.jsx`: page-owned queries and wiring.
- `src/lib/AuthContext.tsx`, `src/pages/Landing.jsx`, `src/pages/UpdatePassword.jsx`: account recovery and invite-token continuity.
- `src/pages/UsersManagement.jsx`, `src/components/settings/SetupAdminTab.jsx`: compatibility redirect to Team.

---

### Task 1: Canonical field-task partition

**Files:**
- Modify: `src/lib/field/fieldToday.js`
- Test: `src/lib/field/__tests__/fieldToday.test.js`

**Interfaces:**
- Consumes: raw `schedule_tasks` rows and an injected `YYYY-MM-DD` date.
- Produces:

```js
partitionFieldTasks(tasks, todayIso) => ({
  today: ScheduleTask[],
  recovery: ScheduleTask[],
  unscheduled: ScheduleTask[],
  upcoming: ScheduleTask[],
})
tasksForToday(tasks, todayIso) => partitionFieldTasks(...).today
```

- [ ] **Step 1: Replace the old behavior assertions with failing partition tests**

```js
import { partitionFieldTasks, tasksForToday } from "../fieldToday";

it("keeps overdue work out of today's plan and puts it in recovery", () => {
  const result = partitionFieldTasks(tasks, TODAY);
  expect(result.today.map((t) => t.id)).toEqual(["today", "active"]);
  expect(result.recovery.map((t) => t.id)).toEqual(["overdue"]);
  expect(tasksForToday(tasks, TODAY).map((t) => t.id)).toEqual(["today", "active"]);
});

it("classifies missing-start future work as a planning gap", () => {
  const result = partitionFieldTasks([
    { id: "gap", end_date: ahead(3), percent_complete: 0 },
  ], TODAY);
  expect(result.unscheduled.map((t) => t.id)).toEqual(["gap"]);
});

it("keeps all future-start work in upcoming without calling it today", () => {
  const result = partitionFieldTasks([
    { id: "soon", start_date: ahead(3), end_date: ahead(6), percent_complete: 0 },
    { id: "far", start_date: ahead(30), end_date: ahead(40), percent_complete: 0 },
  ], TODAY);
  expect(result.upcoming.map((t) => t.id)).toEqual(["soon", "far"]);
  expect(result.today).toEqual([]);
});

it("drops complete, deleted, summary, and parent rows from every bucket", () => {
  const result = partitionFieldTasks(withSummaries, TODAY);
  expect(Object.values(result).flat().map((t) => t.id)).toEqual(["child", "solo"]);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/lib/field/__tests__/fieldToday.test.js`

Expected: FAIL because `partitionFieldTasks` does not exist and `tasksForToday` still includes overdue/undated/upcoming rows.

- [ ] **Step 3: Implement the minimal partition**

Remove the old private `addDaysIso()` helper when replacing the seven-day mixed queue; the canonical partition does not use a future-day cutoff.

```js
export function partitionFieldTasks(tasks, todayIso) {
  const parentIds = buildParentIdSet(Array.isArray(tasks) ? tasks : []);
  const live = (Array.isArray(tasks) ? tasks : []).filter(
    (task) => task && !task.is_deleted && !isSummaryTask(task, parentIds)
      && taskUrgency(task, todayIso) !== "done",
  );
  const buckets = { today: [], recovery: [], unscheduled: [], upcoming: [] };

  for (const task of live) {
    const start = String(task.start_date || "").slice(0, 10);
    const end = String(task.end_date || "").slice(0, 10);
    if (end && end < todayIso) buckets.recovery.push(task);
    else if (end === todayIso || (start && start <= todayIso && (!end || end >= todayIso))) buckets.today.push(task);
    else if (start && start > todayIso) buckets.upcoming.push(task);
    else if (!start) buckets.unscheduled.push(task);
  }

  buckets.today.sort((a, b) => compareTasks(a, b, todayIso));
  buckets.recovery.sort((a, b) => compareTasks(a, b, todayIso));
  buckets.unscheduled.sort((a, b) => taskLabel(a).localeCompare(taskLabel(b)));
  buckets.upcoming.sort((a, b) => compareTasks(a, b, todayIso));
  return buckets;
}

export function tasksForToday(tasks, todayIso) {
  return partitionFieldTasks(tasks, todayIso).today;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/lib/field/__tests__/fieldToday.test.js`

Expected: PASS with overdue rows only in `recovery` and summary/complete rows absent.

- [ ] **Step 5: Commit**

```bash
git add src/lib/field/fieldToday.js src/lib/field/__tests__/fieldToday.test.js
git commit -m "fix(field): separate today plan from recovery backlog"
```

---

### Task 2: Field Today summary and presentation

**Files:**
- Modify: `src/pages/fieldToday/fieldTodayControlCenter.derive.ts`
- Modify: `src/pages/fieldToday/FieldTodayControlCenter.tsx`
- Modify: `src/pages/FieldToday.jsx`
- Test: `src/pages/fieldToday/__tests__/fieldTodayControlCenter.derive.test.ts`

**Interfaces:**
- Consumes: `partitionFieldTasks()` from Task 1.
- Produces:

```ts
interface FieldKpiSummary {
  todaysTasks: number;
  recoveryTasks: number;
  completedToday: null;
  openPunchItems: number;
  photosToday: number;
}

interface FieldTodaySummary {
  kpis: FieldKpiSummary;
  planQueue: ScheduleTaskRecord[];
  recoveryQueue: ScheduleTaskRecord[];
  planningGapCount: number;
  upcomingCount: number;
  todayProgressPct: number;
  tableRows: FieldTaskRow[];
}
```

- [ ] **Step 1: Write failing summary tests**

```ts
it("counts only due-today and active-window work as today's tasks", () => {
  expect(s.kpis.todaysTasks).toBe(2);
  expect(s.planQueue.map((t) => t.id)).toEqual(["t2", "t3"]);
  expect(s.tableRows.map((r) => r.id)).toEqual(["t2", "t3"]);
});

it("exposes overdue work through a separate recovery queue", () => {
  expect(s.kpis.recoveryTasks).toBe(1);
  expect(s.recoveryQueue.map((t) => t.id)).toEqual(["t1"]);
});

it("does not fabricate completed-today evidence", () => {
  expect(s.kpis.completedToday).toBeNull();
});

it("reports average progress for today's plan", () => {
  expect(s.todayProgressPct).toBe(38);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/pages/fieldToday/__tests__/fieldTodayControlCenter.derive.test.ts`

Expected: FAIL because recovery fields do not exist and `completedToday` is `0`.

- [ ] **Step 3: Update the derivation**

```ts
const partition = partitionFieldTasks(allTasks, todayIso);
const todaysWork = partition.today;
const todayProgressPct = todaysWork.length
  ? Math.round(todaysWork.reduce((sum, task) => sum + clampPercent(task.percent_complete), 0) / todaysWork.length)
  : 0;

const kpis = {
  todaysTasks: todaysWork.length,
  recoveryTasks: partition.recovery.length,
  completedToday: null,
  openPunchItems: openPunches.length,
  photosToday: photosToday.length,
};

const planQueue = todaysWork.slice(0, 6);
const recoveryQueue = partition.recovery.slice(0, 6);
```

Build `tableRows` from `todaysWork` only. Return `planningGapCount`, `upcomingCount` for rows starting within seven days, and `todayProgressPct`. Add a private `isoPlusDays(iso: string, days: number)` helper in the derive file and use `isoPlusDays(todayIso, 7)` as the lookahead boundary; keep farther future rows classified as upcoming but outside the seven-day count. The `upcomingCount` test is the regression test for this private helper.

- [ ] **Step 4: Update the control center and page shell**

Use these exact presentation rules:

```tsx
{ label: "Today's Tasks", value: s.kpis.todaysTasks, sublabel: "due or active today" }
{ label: "Recovery", value: s.kpis.recoveryTasks, sublabel: "overdue tasks", tone: s.kpis.recoveryTasks ? "danger" : "neutral" }
{ label: "Completed Today", value: "—", sublabel: "completion time unavailable" }
```

Add a `DecisionPanel` titled `Recovery Backlog` that renders `s.recoveryQueue`, and rename the crew ring value to `Plan Progress` using `s.todayProgressPct`. Remove `tasksForToday()` filtering from `FieldToday.jsx`; pass all project schedule rows to the control center so the derivation owns classification once.

- [ ] **Step 5: Run Field Today suites and verify GREEN**

Run: `npm test -- --run src/lib/field/__tests__/fieldToday.test.js src/pages/fieldToday/__tests__/fieldTodayControlCenter.derive.test.ts`

Expected: PASS, with no test expecting overdue work inside Today’s Plan.

- [ ] **Step 6: Commit**

```bash
git add src/pages/FieldToday.jsx src/pages/fieldToday/FieldTodayControlCenter.tsx src/pages/fieldToday/fieldTodayControlCenter.derive.ts src/pages/fieldToday/__tests__/fieldTodayControlCenter.derive.test.ts
git commit -m "fix(field): present recovery backlog separately"
```

---

### Task 3: Canonical operational health

**Files:**
- Create: `src/lib/projectHealth.ts`
- Create: `src/lib/__tests__/projectHealth.test.ts`

**Interfaces:**
- Consumes: project rows, RFI rows, schedule-task rows, and injected date.
- Produces:

```ts
export type OperationalHealthLabel = "On Track" | "Watch" | "At Risk" | "On Hold" | "Unknown";

export interface OperationalHealthResult {
  label: OperationalHealthLabel;
  severity: 0 | 1 | 2 | 3 | 4;
  partial: boolean;
  reasons: string[];
}

export function deriveOperationalHealth(input: {
  storedStatus?: string | null;
  onHold?: boolean;
  overdueRfis?: number;
  criticalOverdueRfis?: number;
  overdueScheduleTasks?: number;
  rfiEvidenceLoaded: boolean;
  scheduleEvidenceLoaded: boolean;
}): OperationalHealthResult;

export function buildOperationalHealthIndex(
  projects: Array<Record<string, unknown>>,
  rfis: Array<Record<string, unknown>>,
  scheduleTasks: Array<Record<string, unknown>>,
  todayIso: string,
  evidence: { rfiEvidenceLoaded: boolean; scheduleEvidenceLoaded: boolean },
): Record<string, OperationalHealthResult>;

export function capHealthScore(score: number, health: OperationalHealthResult): number;
```

- [ ] **Step 1: Write failing health tests**

```ts
it("prevents On Track when any overdue evidence exists", () => {
  expect(deriveOperationalHealth({
    storedStatus: "On Track",
    overdueRfis: 1,
    criticalOverdueRfis: 0,
    overdueScheduleTasks: 0,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  })).toMatchObject({ label: "Watch", partial: false, reasons: ["1 overdue RFI"] });
});

it("marks five overdue leaf tasks At Risk", () => {
  expect(deriveOperationalHealth({
    storedStatus: "On Track",
    overdueRfis: 0,
    criticalOverdueRfis: 0,
    overdueScheduleTasks: 5,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  }).label).toBe("At Risk");
});

it("never improves a stored worse assessment", () => {
  expect(deriveOperationalHealth({
    storedStatus: "At Risk",
    overdueRfis: 0,
    criticalOverdueRfis: 0,
    overdueScheduleTasks: 0,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  }).label).toBe("At Risk");
});

it("marks missing schedule evidence partial", () => {
  expect(deriveOperationalHealth({
    storedStatus: "On Track",
    overdueRfis: 0,
    criticalOverdueRfis: 0,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: false,
  }).partial).toBe(true);
});

it("keeps an on-hold project distinct from risk severity", () => {
  expect(deriveOperationalHealth({
    storedStatus: "On Track",
    onHold: true,
    overdueRfis: 3,
    criticalOverdueRfis: 0,
    overdueScheduleTasks: 5,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  }).label).toBe("On Hold");
});

it("caps Good scores to the effective severity band", () => {
  const atRisk = deriveOperationalHealth({
    storedStatus: "On Track",
    overdueRfis: 3,
    criticalOverdueRfis: 0,
    overdueScheduleTasks: 0,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  });
  expect(capHealthScore(96, atRisk)).toBe(69);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/lib/__tests__/projectHealth.test.ts`

Expected: FAIL because `projectHealth.ts` does not exist.

- [ ] **Step 3: Implement thresholds and row indexing**

Use a stored severity floor of `On Track=1`, `Watch=2`, `At Risk=3`. Evidence severity is `3` for critical overdue RFIs, at least three overdue RFIs, or at least five overdue leaf tasks; it is `2` for any lesser overdue count. The effective severity is the worse of stored and evidence. Treat `project.on_hold === true` or stored `On Hold` as the distinct `On Hold` result before comparing risk severity. An absent or unrecognized stored status returns `Unknown` unless evidence proves Watch or At Risk; it is always marked partial.

`buildOperationalHealthIndex()` must:

```ts
const OPEN_RFI_STATUSES = new Set(["Open", "Under Review", "Incomplete Response"]);

function isOverdueRfi(row, todayIso) {
  const due = String(row.date_required || row.due_date || "").slice(0, 10);
  return OPEN_RFI_STATUSES.has(String(row.status || "")) && Boolean(due) && due < todayIso;
}

const projectRfis = rfis.filter((row) => row.project_id === project.id);
const projectTasks = scheduleTasks.filter((row) => row.project_id === project.id);
const overdueRfis = projectRfis.filter((row) => isOverdueRfi(row, todayIso)).length;
const criticalOverdueRfis = projectRfis.filter((row) => isOverdueRfi(row, todayIso) && row.priority === "Critical").length;
const overdueScheduleTasks = partitionFieldTasks(projectTasks, todayIso).recovery.length;
```

Import `partitionFieldTasks` from `src/lib/field/fieldToday.js`; this is the sole leaf-task and overdue-task authority.

Pass the supplied `evidence.rfiEvidenceLoaded` and `evidence.scheduleEvidenceLoaded` flags into every project result. A failed or unfinished query must therefore produce `partial: true`; an empty array is authoritative only when its query completed successfully.

Pluralize reasons exactly (`1 overdue RFI`, `2 overdue RFIs`, `1 overdue schedule task`, `2 overdue schedule tasks`). `capHealthScore()` returns at most `84` for Watch and `69` for At Risk.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/lib/__tests__/projectHealth.test.ts`

Expected: PASS for thresholds, partial evidence, reasons, parent-task exclusion, and score caps.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projectHealth.ts src/lib/__tests__/projectHealth.test.ts
git commit -m "feat(health): add canonical operational health"
```

---

### Task 4: Dashboard and Projects use effective health

**Files:**
- Modify: `src/pages/dashboardCC/dashboardControlCenter.derive.ts`
- Modify: `src/pages/dashboardCC/DashboardControlCenter.tsx`
- Modify: `src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts`
- Modify: `src/pages/Projects.jsx`
- Modify: `src/pages/projects/projectsControlCenter.derive.ts`
- Modify: `src/pages/projects/ProjectsControlCenter.tsx`
- Modify: `src/pages/projects/__tests__/projectsControlCenter.derive.test.ts`

**Interfaces:**
- Consumes: `buildOperationalHealthIndex()` and `capHealthScore()` from Task 3.
- Produces: dashboard `operationalHealth`, portfolio `healthByProjectId`, and effective at-risk counts/queues.

- [ ] **Step 1: Write failing dashboard tests**

```ts
it("caps project health when overdue RFIs contradict a Good score", () => {
  const s = buildDashboardSummary({
    project: { id: "p1", health_status: "On Track" },
    rfis: [{ project_id: "p1", status: "Open", date_required: isoOffset(-1) }],
    scheduleTasks: [],
    todayIso: TODAY,
    rfiEvidenceLoaded: true,
    scheduleEvidenceLoaded: true,
  });
  expect(s.operationalHealth.label).toBe("Watch");
  expect(s.healthScore).toBeLessThanOrEqual(84);
  expect(s.healthReasons).toContain("1 overdue RFI");
});
```

- [ ] **Step 2: Write failing Projects tests**

```ts
it("moves stored On Track projects with five overdue leaf tasks into At Risk", () => {
  const s = buildProjectsSummary(
    [makeProject({ id: "p1", health_status: "On Track" })],
    [],
    [],
    [],
    Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, project_id: "p1", end_date: isoOffset(-1), percent_complete: 0 })),
    TODAY,
    { rfiEvidenceLoaded: true, scheduleEvidenceLoaded: true },
  );
  expect(s.kpis.atRisk).toBe(1);
  expect(s.atRiskQueue[0].project.id).toBe("p1");
  expect(s.healthByProjectId.p1.label).toBe("At Risk");
});
```

- [ ] **Step 3: Run both suites and verify RED**

Run: `npm test -- --run src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts src/pages/projects/__tests__/projectsControlCenter.derive.test.ts`

Expected: FAIL because the result types do not expose canonical health and Projects does not accept schedule tasks.

- [ ] **Step 4: Integrate the dashboard derivation**

Add `todayIso?: string` to `buildDashboardSummary()` input and normalize it once with `const effectiveToday = todayIso ?? new Date().toISOString().slice(0, 10)`. Build the one-project health index from `project`, `rfis`, and `scheduleTasks`. Replace the raw score assignment with:

```ts
const rawHealthScore = Math.round((budgetHealth + scheduleHealth + qualityHealth + safetyHealth) / 4);
const operationalHealth = buildOperationalHealthIndex(
  project?.id ? [project] : [], rfis, scheduleTasks, effectiveToday,
  { rfiEvidenceLoaded, scheduleEvidenceLoaded },
)[String(project?.id)] ?? deriveOperationalHealth({
  storedStatus: String(project?.health_status || ""),
  overdueRfis: 0,
  criticalOverdueRfis: 0,
  overdueScheduleTasks: 0,
  rfiEvidenceLoaded,
  scheduleEvidenceLoaded,
});
const healthScore = capHealthScore(rawHealthScore, operationalHealth);
```

Add `rfiEvidenceLoaded` and `scheduleEvidenceLoaded` to the summary input, sourced from the corresponding TanStack Query `isSuccess` values in `Dashboard.jsx`. Return `operationalHealth` and `healthReasons`. Render the hero label from `operationalHealth.label`, append `(partial)` when needed, and use the effective label for tone.

- [ ] **Step 5: Integrate Projects data and derivation**

In `Projects.jsx`, change the portfolio child queries for work packages, RFIs, and change orders to `listAll()`, load `entities.ScheduleTask.listAll("start_date")`, and retain the RFI and schedule query `isSuccess` flags. Scope rows through visible project IDs, build one `healthByProjectId` index, and use it for the health filter. Pass schedule tasks, evidence flags, and the injected current date to `ProjectsControlCenter`.

Extend `buildProjectsSummary(projects, workPackages, rfis, changeOrders, scheduleTasks, todayIso, evidence)` to compute `healthByProjectId`, effective at-risk count, and at-risk queue. Render effective health pills and reason text in the project table. A failed child query must mark every affected result partial instead of interpreting its default empty array as healthy evidence.

- [ ] **Step 6: Run both suites and verify GREEN**

Run: `npm test -- --run src/lib/__tests__/projectHealth.test.ts src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts src/pages/projects/__tests__/projectsControlCenter.derive.test.ts`

Expected: PASS, with no effective `On Track` result when overdue evidence exists.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard.jsx src/pages/dashboardCC src/pages/Projects.jsx src/pages/projects
git commit -m "fix(health): use operational evidence across dashboards"
```

---

### Task 5: RFI portfolio aggregation and health context

**Files:**
- Create: `src/pages/rfis/rfiPortfolioScope.ts`
- Create: `src/pages/rfis/__tests__/rfiPortfolioScope.test.ts`
- Create: `src/pages/rfis/__tests__/RfiControlCenter.trust.test.tsx`
- Modify: `src/pages/RFIs.jsx`
- Modify: `src/pages/rfis/RfiControlCenter.tsx`

**Interfaces:**
- Consumes: active project rows, `buildOperationalHealthIndex()`, and entity `listAll()`.
- Produces:

```ts
export function scopeRfiPortfolioRows<T extends { project_id?: string | null }>(
  projects: Array<{ id?: string | null }>,
  rows: T[],
): T[];
```

`RfiControlCenterProps` gains:

```ts
contextMode: "project" | "portfolio";
operationalHealth?: OperationalHealthResult | null;
portfolioProjectCount?: number;
portfolioAtRiskCount?: number;
loadError?: string | null;
onRetryLoad?: (() => void) | null;
```

- [ ] **Step 1: Write failing portfolio-scope tests**

```ts
it("keeps only rows owned by visible active projects", () => {
  expect(scopeRfiPortfolioRows(
    [{ id: "p1" }, { id: "p2" }],
    [{ id: "r1", project_id: "p1" }, { id: "r2", project_id: "held" }, { id: "r3", project_id: null }],
  )).toEqual([{ id: "r1", project_id: "p1" }]);
});

it("renders unavailable instead of zero KPIs when the RFI query failed", () => {
  const requiredProps = {
    contextMode: "portfolio" as const,
    projectName: "All Projects",
    search: "",
    onSearch: () => {},
    disciplineFilter: "All",
    onDisciplineChange: () => {},
    onOpenRfi: () => {},
    onExport: () => {},
  };
  render(<RfiControlCenter {...requiredProps} rfis={[]} filtered={[]} loadError="RFI data unavailable" />);
  expect(screen.getByText("RFI data unavailable")).toBeInTheDocument();
  expect(screen.queryByText("0 Total")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the scope test and verify RED**

Run: `npm test -- --run src/pages/rfis/__tests__/rfiPortfolioScope.test.ts src/pages/rfis/__tests__/RfiControlCenter.trust.test.tsx`

Expected: FAIL because `rfiPortfolioScope.ts` and the RFI unavailable-data state do not exist.

- [ ] **Step 3: Implement the pure scope helper**

```ts
export function scopeRfiPortfolioRows(projects, rows) {
  const visibleIds = new Set(projects.map((project) => project.id).filter(Boolean));
  return rows.filter((row) => Boolean(row.project_id) && visibleIds.has(row.project_id));
}
```

- [ ] **Step 4: Change RFI page queries and mutation guards**

Use `entities.Project.listAll()` for the visible project authority and retain its `isSuccess`, `isError`, `error`, and `refetch` state. Use explicit query modes:

```jsx
const isPortfolio = !projectId;
const {
  data: rawRfis = [],
  isLoading: rfisLoading,
  isError: rfisError,
  error: rfiError,
  refetch: refetchRfis,
} = useQuery({
  queryKey: ["rfis", projectId || "portfolio"],
  queryFn: () => projectId
    ? entities.RFI.filter({ project_id: projectId }, "-submitted_date")
    : entities.RFI.listAll("-submitted_date"),
});
```

Import `toUserErrorMessage` and the existing `RegisterFetchStates` component. Combine project and RFI failures into `loadError`, and combine their refetch callbacks in `onRetryLoad`. Pass those props to the control center. When `loadError` is present, render `RegisterFetchStates` before building numeric chips or KPIs. This prevents a failed project authority query from collapsing the scoped portfolio to false zeros.

Apply the same project/filter versus portfolio/listAll pattern to work packages and schedule tasks, retaining `isSuccess` for both evidence sources. In portfolio mode, scope all child rows through `scopeRfiPortfolioRows(projects, rows)`. Build operational health with `{ rfiEvidenceLoaded: rfisSuccess, scheduleEvidenceLoaded: scheduleTasksSuccess }`; render partial health and unavailable percent-complete evidence instead of healthy/zero values when those child queries did not complete.

Set `onCreate` and `onImport` to `null` in portfolio mode. Do not mount RFI create/import modals without a selected project. Existing-row edit, export, and status mutations remain available because each RFI already carries its project ID.

Guard the overdue-alert creation effect with `if (!projectId) return;` so opening All Projects does not trigger cross-project writes.

- [ ] **Step 5: Render honest portfolio hero stats**

Project mode shows effective operational health, reasons, and percent complete. Portfolio mode shows:

```ts
[
  { value: portfolioProjectCount, label: "Active Projects" },
  { value: portfolioAtRiskCount, label: "At Risk" },
]
```

Keep all RFI KPI calculations driven by the scoped `rfis` array so All Projects equals the sum of visible project rows.

- [ ] **Step 6: Run focused RFI and health tests**

Run: `npm test -- --run src/pages/rfis/__tests__/rfiPortfolioScope.test.ts src/pages/rfis/__tests__/RfiControlCenter.trust.test.tsx src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts src/lib/__tests__/projectHealth.test.ts`

Expected: PASS with portfolio row scoping and unchanged RFI summary math.

- [ ] **Step 7: Commit**

```bash
git add src/pages/RFIs.jsx src/pages/rfis/RfiControlCenter.tsx src/pages/rfis/rfiPortfolioScope.ts src/pages/rfis/__tests__/rfiPortfolioScope.test.ts src/pages/rfis/__tests__/RfiControlCenter.trust.test.tsx
git commit -m "fix(rfi): aggregate visible projects in portfolio mode"
```

---

### Task 6: Supabase signup outcome and invite-aware redirects

**Files:**
- Create: `src/lib/auth/signupOutcome.ts`
- Create: `src/lib/auth/__tests__/signupOutcome.test.ts`
- Modify: `src/lib/AuthContext.tsx`
- Modify: `src/components/shared/__tests__/useAppSecurity.test.tsx`

**Interfaces:**
- Consumes: Supabase signup response shape and current URL search string.
- Produces:

```ts
export type SignUpNext = "signed_in" | "confirm_email" | "existing_account";
export function classifySignUpResponse(data: {
  session?: unknown | null;
  user?: { identities?: unknown[] | null } | null;
}): SignUpNext;
export function inviteAwareUrl(origin: string, pathname: string, search: string): string;

export type SignUpResult =
  | { success: true; next: SignUpNext }
  | { success: false; error: AuthError };
```

- [ ] **Step 1: Write failing classifier and URL tests**

```ts
it("classifies an identity-less signup response as an existing account", () => {
  expect(classifySignUpResponse({ session: null, user: { identities: [] } })).toBe("existing_account");
});

it("classifies a new email identity without a session as confirmation pending", () => {
  expect(classifySignUpResponse({ session: null, user: { identities: [{ provider: "email" }] } })).toBe("confirm_email");
});

it("preserves only the invite token on auth return URLs", () => {
  expect(inviteAwareUrl("https://steelbuild-pro.com", "/update-password", "?invite=abc&projectId=p1"))
    .toBe("https://steelbuild-pro.com/update-password?invite=abc");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/lib/auth/__tests__/signupOutcome.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

```ts
export function classifySignUpResponse(data): SignUpNext {
  if (data.session) return "signed_in";
  if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) return "existing_account";
  return "confirm_email";
}

export function inviteAwareUrl(origin, pathname, search) {
  const invite = new URLSearchParams(search).get("invite");
  const url = new URL(pathname, origin);
  if (invite) url.searchParams.set("invite", invite);
  return url.toString();
}
```

- [ ] **Step 4: Integrate AuthContext**

Use `inviteAwareUrl(window.location.origin, "/", window.location.search)` for `emailRedirectTo`, and `inviteAwareUrl(window.location.origin, "/update-password", window.location.search)` for password reset. Return `{ success: true, next }` from signup and authenticate immediately only when `next === "signed_in"`.

- [ ] **Step 5: Run auth helper and context-adjacent tests**

Run: `npm test -- --run src/lib/auth/__tests__/signupOutcome.test.ts src/components/shared/__tests__/useAppSecurity.test.tsx src/boot/__tests__/AuthenticatedApp.test.jsx`

Expected: PASS with updated `SignUpResult` mocks using `next`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/signupOutcome.ts src/lib/auth/__tests__/signupOutcome.test.ts src/lib/AuthContext.tsx src/components/shared/__tests__/useAppSecurity.test.tsx
git commit -m "fix(auth): distinguish existing accounts during signup"
```

---

### Task 7: Honest signup/recovery UI and invite continuity

**Files:**
- Create: `src/pages/landing/authMessaging.ts`
- Create: `src/pages/landing/__tests__/authMessaging.test.ts`
- Modify: `src/pages/Landing.jsx`
- Modify: `src/pages/UpdatePassword.jsx`
- Create: `src/pages/__tests__/Landing.auth.test.tsx`

**Interfaces:**
- Consumes: `SignUpNext` and `inviteAwareUrl()` from Task 6.
- Produces:

```ts
export function signupMessage(next: SignUpNext, email: string): {
  heading: string;
  body: string;
  showReset: boolean;
};
```

- [ ] **Step 1: Write failing messaging tests**

```ts
it("does not promise an email for an existing account response", () => {
  expect(signupMessage("existing_account", "user@example.com")).toEqual({
    heading: "Account may already exist",
    body: "Try signing in with user@example.com, or reset the password if you do not know it.",
    showReset: true,
  });
});

it("retains confirmation copy for a proven new email identity", () => {
  expect(signupMessage("confirm_email", "user@example.com").heading).toBe("Check your email");
});
```

- [ ] **Step 2: Write a failing Landing interaction test**

Render `Landing` with `onSignUp` resolving `{ success: true, next: "existing_account" }`. Open Create account, fill the form, accept terms, submit, and assert:

```tsx
expect(await screen.findByRole("heading", { name: "Account may already exist" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
expect(screen.queryByText(/sent a confirmation link/i)).not.toBeInTheDocument();
```

- [ ] **Step 3: Run both tests and verify RED**

Run: `npm test -- --run src/pages/landing/__tests__/authMessaging.test.ts src/pages/__tests__/Landing.auth.test.tsx`

Expected: FAIL because the messaging helper and existing-account UI do not exist.

- [ ] **Step 4: Implement messaging and UI states**

Replace `signupNotice` string state with the object returned by `signupMessage()`. For `existing_account`, show `Back to sign in` and `Reset password` actions. The reset action clears the notice and changes `authMode` to `forgot` without changing `window.location.search`.

In `UpdatePassword`, construct sign-in/cancel destinations with `inviteAwareUrl(window.location.origin, "/", window.location.search)` so a password-reset recipient returns to the original workspace invitation.

- [ ] **Step 5: Run the auth UI suites and verify GREEN**

Run: `npm test -- --run src/lib/auth/__tests__/signupOutcome.test.ts src/pages/landing/__tests__/authMessaging.test.ts src/pages/__tests__/Landing.auth.test.tsx src/boot/__tests__/AuthenticatedApp.test.jsx`

Expected: PASS, with no false email promise and invite parameters preserved.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Landing.jsx src/pages/UpdatePassword.jsx src/pages/landing src/pages/__tests__/Landing.auth.test.tsx
git commit -m "fix(auth): guide existing invitees to password recovery"
```

---

### Task 8: Make Team the sole membership authority

**Files:**
- Replace: `src/pages/UsersManagement.jsx`
- Modify: `src/components/settings/SetupAdminTab.jsx`
- Create: `src/pages/__tests__/UsersManagement.redirect.test.tsx`
- Modify: `src/pages/OrgMembers.jsx`

**Interfaces:**
- Consumes: existing `/OrgMembers` route and Team invitation handlers.
- Produces: legacy `/UsersManagement` compatibility redirect and explicit link-created messaging.

- [ ] **Step 1: Write the failing redirect test**

```tsx
it("redirects legacy User Management to the canonical Team page", () => {
  render(
    <MemoryRouter initialEntries={["/UsersManagement"]}>
      <Routes>
        <Route path="/UsersManagement" element={<UsersManagement />} />
        <Route path="/OrgMembers" element={<div>TEAM_PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByText("TEAM_PAGE")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/pages/__tests__/UsersManagement.redirect.test.tsx`

Expected: FAIL because the legacy page renders its own user-profile table.

- [ ] **Step 3: Replace the legacy page and settings entry**

```jsx
import { Navigate } from "react-router-dom";

export default function UsersManagement() {
  return <Navigate to="/OrgMembers" replace />;
}
```

Change `SetupAdminTab` to use `{ page: "OrgMembers", label: "Team", desc: "Workspace invitations, roles, and membership" }`.

- [ ] **Step 4: Make Team invitation copy explicit**

Use these exact success messages in `OrgMembers.jsx`:

```js
toast.success(`Invite link created for ${addr} — link copied; send it to the recipient`);
toast.success(`Created ${okCount} invite link${okCount === 1 ? "" : "s"} — copy and send each link from Pending invites`);
```

Do not use `sent`, `emailed`, or `delivered` because this flow creates links only.

- [ ] **Step 5: Run route, Team, and onboarding tests**

Run: `npm test -- --run src/pages/__tests__/UsersManagement.redirect.test.tsx src/pages/team/__tests__/teamControlCenter.derive.test.ts src/boot/__tests__/AuthenticatedApp.test.jsx src/pages/onboarding/__tests__/onboardingPageHelpers.test.ts`

Expected: PASS with the compatibility redirect and existing Team behavior intact.

- [ ] **Step 6: Commit**

```bash
git add src/pages/UsersManagement.jsx src/pages/__tests__/UsersManagement.redirect.test.tsx src/pages/OrgMembers.jsx src/components/settings/SetupAdminTab.jsx
git commit -m "fix(team): make workspace invitations canonical"
```

---

### Task 9: Integrated verification and acceptance

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: fresh test/build/browser evidence and a reviewable final diff.

- [ ] **Step 1: Run corrected-flow tests**

Run:

```bash
npm test -- --run \
  src/lib/field/__tests__/fieldToday.test.js \
  src/pages/fieldToday/__tests__/fieldTodayControlCenter.derive.test.ts \
  src/lib/__tests__/projectHealth.test.ts \
  src/pages/dashboardCC/__tests__/dashboardControlCenter.derive.test.ts \
  src/pages/projects/__tests__/projectsControlCenter.derive.test.ts \
  src/pages/rfis/__tests__/rfiPortfolioScope.test.ts \
  src/pages/rfis/__tests__/RfiControlCenter.trust.test.tsx \
  src/pages/rfis/__tests__/rfiControlCenter.derive.test.ts \
  src/lib/auth/__tests__/signupOutcome.test.ts \
  src/pages/landing/__tests__/authMessaging.test.ts \
  src/pages/__tests__/Landing.auth.test.tsx \
  src/pages/__tests__/UsersManagement.redirect.test.tsx
```

Expected: all listed files pass with zero failures.

- [ ] **Step 2: Run repository gates**

Run each command separately and retain exit codes:

```bash
npm test -- --run
npm run typecheck
npm run typecheck:js
npm run lint
npm run check:no-new-js
npm run build
```

Expected: every command exits `0` with no test failures, TypeScript errors, ESLint errors, newly added JavaScript/JSX files, or Vite build errors.

- [ ] **Step 3: Run read-only live-data acceptance**

Against Supabase project `kjrwqagyeswwoxpjkcko`, query active project/RFI/task aggregates without mutation and verify:

- All Projects RFI inputs total `221` rows in the current snapshot, including `3` open and `3` overdue.
- The affected project’s six 7/23–8/1 rows classify as Recovery Backlog, not Today’s Plan.
- The affected project resolves to effective `At Risk` from `2` overdue RFIs and `6` overdue leaf schedule tasks.

If live data has changed since the audit, compare the application against the newly queried counts rather than forcing the historical numbers.

- [ ] **Step 4: Run authenticated browser acceptance**

Start the app:

```bash
npm run dev -- --host 127.0.0.1
```

Verify by clicking through the rendered application:

1. Select All Projects, open RFIs, and confirm totals are nonzero and equal the visible portfolio register.
2. Select the affected project and confirm effective health is `At Risk` with overdue reasons.
3. Open Field Today and confirm the six 7/23–8/1 tasks appear under Recovery Backlog and not Today’s Plan.
4. Open Settings → Team and confirm the canonical invitation surface is discoverable.
5. Open `/UsersManagement` and confirm it redirects to `/OrgMembers`.
6. Confirm the unauthenticated invite page retains `?invite=` while switching between sign-in, signup, and forgot-password modes. Do not submit a real signup during production browser acceptance; the existing-account response is covered by the mocked interaction test.

- [ ] **Step 5: Inspect the final diff and request code review**

Run:

```bash
git status --short
git diff --check origin/main...HEAD
git diff --stat origin/main...HEAD
```

Dispatch the required code-reviewer with `origin/main` as the base and the current `HEAD` as the review target. Resolve every Critical and Important finding, then rerun Steps 1–4.

- [ ] **Step 6: Commit any verification corrections**

If review or verification required corrections in already-listed files:

```bash
git add src
git commit -m "fix(trust): address verification findings"
```

If no corrections were required, do not create an empty commit.
