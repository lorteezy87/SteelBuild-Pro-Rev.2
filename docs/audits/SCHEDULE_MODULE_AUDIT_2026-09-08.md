# Scheduling Module — audit, 2026-09-08

Scope: `/ScheduleHub` and its three tabs (Schedule, Look-Ahead, Calendar), the
Schedule page container and Command Center shell, the Gantt, 6-Week Lookahead
and Task List views, every add/edit surface (New Task, Bulk Add, WBS Builder,
Task Detail Drawer, inline row edit, bar drag, bulk toolbars), the CSV and
MS Project importers, the ICS/PDF exports, the cascade and gatekeeper services,
the `schedule_tasks` schema/triggers/RLS, and every route into and out of the
page.

Ground truth: the code cited below (every claim was read, not inferred from a
name), `supabase/migrations/20260101000010_baseline_schema.sql` plus later
migrations, `src/types/supabase.ts`, and a census of production
(`kjrwqagyeswwoxpjkcko`) taken 2026-09-08. Four findings were additionally
proven with a throwaway vitest probe against the real modules.

## Production census — this sizes every finding below

419 tasks across 15 projects; largest single project 88 tasks.

| Signal | Count | Share |
|---|---|---|
| `activities` rows for the schedule (of 914 app-wide) | 245 | 27% |
| …of those recording a **date-bearing** change | **0** | **0%** |
| `planner_action_events` rows for `schedule_task` | 616 | — |
| …of those that **moved a start or finish date** | 86 | 14% |
| Predecessor links that **cross a phase boundary** | **92 of 137** | **67%** |
| Predecessor links pointing at a **deleted task** | **26 of 137** | **19%** |
| Rows where `duration` **disagrees** with `end_date - start_date` | **216 of 419** | **52%** |
| Open tasks past their finish date | 137 | 33% |
| Tasks missing a start or finish date | 81 | 19% |
| Tasks with **any baseline** stored | 19 | 4.5% |
| Tasks starting on a **Saturday or Sunday** | 32 | 8% |
| `status = Complete` with **no finish date at all** | 40 | 23% of complete |
| Tasks with no resource and no assignee | 101 | 24% |
| Rows with `end_date < start_date` (pre-validator legacy) | 2 | — |
| `look_ahead` rows (the whole Look-Ahead tab) | **2** | — |

Severity: **P1** = the schedule shows or stores a wrong number a PM would act
on; **P2** = real defect, narrower blast radius; **P3** = hygiene or a risk not
yet live at current data volumes.

---

## 1. Source-of-truth defects (P1)

### 1.1 The Gantt's phase filter silently changes the dates it shows — P1

`ScheduleGantt.jsx:193-253` filters `rawTasks` by `phaseFilter` into `grouped`,
flattens that into `allTasks`, and only then calls
`computeEffectiveDates(allTasks)`. In `scheduleCascade.ts:resolve()`, a
predecessor that isn't in the array resolves to `null` and the link is skipped.

So filtering the Gantt to one phase drops every predecessor outside it, and the
successor snaps back to its un-cascaded stored dates — with no indicator.

**67% of all logic in production (92 of 137 links) crosses a phase boundary.**
That is the normal shape of a steel schedule: Detailing → Approval → Fab →
Delivery → Erection. Clicking the "Fabrication" KPI tile is the single most
common action on this page, and it invalidates two-thirds of the network.

Proven:

```
unfiltered      fab start: 2026-03-07  shifted: true
phase-filtered  fab start: 2026-03-02  shifted: false
```

The fix is one line of scope: cascade over the full task list, then filter for
display. `Schedule.tsx:180` already computes exactly that map
(`effectiveDatesMap`) over all tasks and threads it into `ScheduleBody` — the
Gantt just doesn't use it and recomputes its own.

### 1.2 Three views of the same task, three different dates — P1

| Surface | Data it receives | Dates it shows |
|---|---|---|
| Gantt (`ScheduleBody.tsx:231`) | `enrichedTasks` | its own **phase-scoped** cascade |
| Task List (`:273`) | `tasksWithEffective` | **global** cascade |
| 6-Week Lookahead (`:266`) | `tasksWithEffective` | **global** cascade |
| Rivet brief (`Schedule.tsx:192`) | `enrichedTasks` | **stored** dates for overdue/due-soon |
| Calendar tab (`ProjectCalendar.jsx:144`) | own query | **stored** dates |

`rivetBriefEngine.js:218` computes `effectiveDates` and then classifies overdue,
starts-soon and due-soon from `daysFromToday(task.start_date)` — the *stored*
value (`:260-262`). It uses the cascade only for the "shifted" narrative. So the
brief can call a task overdue while its bar sits weeks in the future.

The Calendar is the worst of these because it is a **sibling tab of the Gantt**
in the same shell (`ScheduleHub.jsx`): two clicks apart, same task, different
week.

`applyEffectiveDates` exists precisely to end this and is used by only four
call sites app-wide. The ~20 other surfaces that read `schedule_tasks` —
`FieldPlan`, `FieldToday`, `PortfolioHub`, `RFIs`, `Submittals`,
`ProjectCalendar` and every `pages/reports/*` page — all render stored dates.

### 1.3 The audit trail exists — nothing could read it — P1

> **Corrected 2026-09-08 (batch 2).** This read "Zero audit trail on the
> schedule — 0 of 909 activity rows are `schedule_task`". That count was
> measured against the wrong string: `logActivity` writes the entity LABEL
> (`'ScheduleTask'`), not the key. There are **245** such rows. The conclusion
> survived — all 245 are reparents and cross-link edits, so no date-bearing
> write reached `activities` — but the premise was wrong in a way that changes
> the fix, so it is restated below.

`logActivity` is called from exactly two places in the module:

- `reparentTasks.js:42` — parent/sort changes only.
- `TaskDetailDrawer.jsx:92` — and only when RFI/CO/action-item cross-links
  change. **Date, duration and status edits from the drawer are not logged.**

Not logged *there*: Gantt inline edit, bar drag-to-reschedule, Set Baseline,
Update Scheduled Dates, all five bulk toolbars, create, delete, bulk delete,
CSV import, MPP import.

**But they are logged elsewhere.** `record_planner_action_event` has written
every `schedule_tasks` INSERT and UPDATE to `planner_action_events` since
2026-08-05, with `before_state` / `after_state` and `actor_user_id`: 410 updates
(86 of which moved a start or finish date), 206 creates, across 257 distinct
tasks. Being a *database* trigger it covers every write path — the Gantt drag,
the bulk toolbars, CSV/MPP import, the MCP server, direct SQL. And because
`planner_action_events` has a SELECT policy and **no INSERT policy**, its only
writer is that SECURITY DEFINER function: the trail cannot be forged or
suppressed from a client.

So the fix is *not* to add `logActivity` to every write path. That builds a
second, weaker, app-side trail beside a stronger one — narrower coverage, and
forgeable. The real gaps were:

1. **DELETE was not covered at all** — a deleted task simply vanished, which is
   the single most important event to be able to explain in a delay claim.
2. `duration`, `dependencies`, `wbs_code`, `phase` and `parent_task_id` were
   missing from the snapshot, so "the logic changed" and "the durations were
   compressed" were both invisible.
3. **Nothing could read it back.** The drawer's HISTORY tab rendered the literal
   string "No history yet" over a complete trail.

All three are closed in batch 2 (`20260908150000_schedule_change_log_completeness.sql`,
`src/services/scheduleChangeLog.ts`, `src/components/schedule/TaskHistoryTab.jsx`).

### 1.4 There is nowhere to record what actually happened — P1

`schedule_tasks` has `start_date`, `end_date`, `duration`, `percent_complete`,
`status`. It has **no `actual_start_date` and no `actual_finish_date`**
(`src/types/supabase.ts:6259`, baseline schema `:4780`).

Consequences:

1. Marking a task Complete overwrites nothing and records nothing — 40 complete
   tasks in production have no finish date at all.
2. Planned-vs-actual variance cannot be computed, so the schedule cannot answer
   the only question that matters in a claim: *did we finish when we said?*
3. Progress is a hand-typed percentage with no evidence behind it.

`bulkUpdateMut` (`useScheduleMutations.ts:143`) sets `percent_complete: 100` on
Complete and stamps no date.

### 1.5 Baseline is a JSON blob, snapshot from the wrong numbers, under a filter — P1

`ScheduleGantt.jsx:400-435`:

1. It writes `baseline_start` / `baseline_end` / `baseline_set_at` into the
   `metadata` JSONB column — no schema, no constraint, no history, no author,
   no reason, and only one baseline ever (the confirm text says "Existing
   baseline data will be overwritten").
2. It snapshots `effStart(task)` / `effEnd(task)` — the **cascaded** dates, not
   the dates anyone entered or agreed to.
3. It runs over `allTasks`, which is **phase-filtered**. With a filter active it
   silently baselines only the visible phase, while the confirm dialog reports a
   count that looks like the whole job.
4. It is gated by `window.confirm`, and it writes no audit entry.

Only 19 of 419 tasks carry a baseline. The feature is, in practice, unused —
which is the right instinct given the above.

A steel project needs Baseline 0 (contract), then a re-baseline per approved
time extension or CO impact, each with date, author and justification. That is a
table, not a JSON key.

### 1.6 Delete leaves 19% of the logic network dangling — P1

`deleteTaskMut` / `bulkDeleteMut` (`useScheduleMutations.ts:126,169`) delete the
row and nothing else. `dependencies` is a **TEXT column holding JSON** — there is
no foreign key, so Postgres cannot cascade, and no application code cleans up.

**26 of 137 links in production (19%) point at a task that no longer exists.**

The code already knows this happens: `formatPredecessorLabels`
(`scheduleDependencies.js`) exists specifically to skip orphans so the PRED
column doesn't print `undefined`. The display was fixed; the data was not. Every
orphaned link is a piece of sequencing logic that silently stopped constraining
anything.

(Children are safe — the FK on `parent_task_id` is `ON DELETE SET NULL` and the
rollup trigger re-fires. Only predecessor links rot.)

---

## 2. Date and rollup logic (P2)

### 2.1 No working-day calendar anywhere in the Gantt — P2

All Gantt/cascade math is **calendar days**. `scheduleDateUtils.calcDuration` is
`(end - start) / 86400000`; `addDaysIso` adds raw days; FS+1 off a Friday finish
starts the successor **Saturday**.

**32 tasks in production start on a weekend.**

The repo already has both libraries and uses neither here:

- `src/lib/workingDays.ts` — Mon–Fri math, used by Submittals.
- `src/lib/workweek.js` — `WORKDAYS_PER_WEEK` knob (5/6/7), used by Crew
  Scheduling (`ResourceScheduling.tsx`).

So **Crew Scheduling and the Gantt disagree about how long a week is**, in the
same app, about the same crews.

There is also no holiday calendar and no per-project shift pattern (a shop
running 4×10s or Saturday overtime cannot be modelled).

### 2.2 "Critical path" is a checkbox — P2

`isCriticalTask` (`scheduleGanttHelpers.ts:136`) ORs three manual flags:
`is_critical`, `is_critical_path`, `metadata.critical_path`. The drawer exposes
it as a toggle labelled "Mark as Critical Path"
(`TaskDetailDrawer.jsx:502`).

There is **no forward/backward pass and no float calculation anywhere in the
repo** (`grep` for `total_float` / `criticalPath` returns only these flags and
narrative strings).

Everything downstream inherits the fiction: the Rivet brief writes "directly
impacting the critical path" (`rivetBriefEngine.js:82`), "Walk the critical
path" (`:365`), and "+Nd pressure on the critical path" (`:184`) — all from a
box someone ticked, possibly months ago, possibly before the dates moved.

The cascade already does a forward pass. Total float is a backward pass from the
project finish over the same graph — the hard part is done.

### 2.3 Summary % complete is an unweighted mean — P2

`scheduleTree.js:rollupSummary` averages `displayPct` across direct children
with no weighting. Proven:

```
child A: "Punch 1 pc"      1 day,  100%
child B: "Erect 60 days"  60 days,   0%
summary percent_complete: 50        (duration-weighted truth: ~2%)
```

The same unweighted mean is the **headline project number**:
`scheduleCommandCenter.derive.ts` defines `pctComplete` as the "mean displayPct
across all actionable tasks", and `ScheduleCommandCenter.tsx:131,169` renders it
in the hero and the KPI strip. `LookaheadPlanner.jsx:68` does the same thing by
count for its weekly progress bar.

That is the number a PM reads off the screen and repeats to an owner. It should
be weighted by duration at minimum, by budget hours ideally (the data is on the
`BudgetHours` page).

### 2.4 `duration` disagrees with the dates on half the table — P2

There are two independent sources of duration truth:

- Derived: `calcDuration(start, end)` — what the Gantt, Task List and drawer
  display.
- Stored: the `duration` column — what `bulkDurationMut`
  (`useScheduleMutations.ts:259`) reads and writes, and what the importers set.

**216 of 419 rows (52%) have a `duration` that does not equal
`end_date - start_date`.** Bulk Duration edits the stale one and then rewrites
`end_date` from it, so a bulk duration change can move a task's finish
based on a number the UI never showed the user.

The DB rollup trigger deliberately does not roll up `duration`
(`20260707061933_schedule_summary_rollup.sql:22`), so summary rows are stale by
design at the database level and only corrected in the display layer.

### 2.5 "Today" is UTC everywhere; Arizona is UTC-7 — P2

- `ScheduleGantt.jsx:112` builds `today` from `getUTCFullYear/Month/Date`.
- `LookaheadPlanner.jsx:31` does the same for its week buckets.
- `AddTaskModal.jsx:11,26`, `BulkAddTaskModal.jsx:10`, `WbsBuilderModal.jsx:97`,
  `ScheduleBody.tsx:335`, `scheduleUtils.jsx:13,55` all default dates with
  `new Date().toISOString().split('T')[0]`.

From **5:00 PM local onward**, all of these are **tomorrow**. The today line
jumps a day early, overdue flips a day early, the 6-week window slides, and
every task a PM enters after 5 PM is dated tomorrow by default.

`todayLocalISO()` already exists in `src/lib/dateMath.js` and `src/lib/dateOnly.js`
and is used correctly by the Submittals and Detailing code.

### 2.6 Dragging a cascaded bar does nothing, silently — P2

`useTaskBarDrag.js` correctly applies the pixel delta to **stored** dates
(`:110-118`) — that part is right. But the bar is rendered at its **effective**
position. If a task is held by a predecessor, dragging it forward writes
`stored + N`, the cascade re-derives the same `pred.end + lag`, and the bar
lands back where it started. No toast, no explanation.

The row already knows why (`_shifted`, `_shifted_by`, and the tooltip on
`ScheduleTaskList.jsx:406`). The Gantt should say "held by <predecessor> — edit
the link or the predecessor" instead of accepting a drag it will discard.

There is also no weekend snapping on drop.

### 2.7 `rollupSummary` overwrites `_stored_start_date` — P3

`scheduleTree.js:rollupSummary` sets `_stored_start_date: task.start_date`. When
`buildTreeOrder` runs on `tasksWithEffective` (the Task List path,
`ScheduleTaskList.jsx:178`), `task.start_date` is already the *effective* value,
so the field that is supposed to hold the pre-cascade truth gets the
post-cascade value. Proven:

```
true stored: 2026-03-01 | _stored_start_date after rollup: 2026-04-01
```

The Task List inline editor seeds from that field (`:122`) and
`sanitizeScheduleTaskUpdatePayload` writes it back for summary rows
(`wbs.ts:127`).

Blast radius is small and self-healing: the DB trigger
(`recompute_schedule_summary`) re-derives summary dates from children on the
next write, so the bad value doesn't persist. `ScheduleBody.tsx:281` also
already re-looks-up the unmodified row before opening the drawer — the
mitigation is there, the inline path just slips past it. Worth fixing for
hygiene, not urgent.

### 2.8 `buildTreeOrder` has no cycle guard — P3

`hierarchy.js` prevents cycles on every write path (`wouldCreateCycle`, batch-
validated in `reparentTasks.js:30`), and migration
`20260626041744_prevent_schedule_task_cycle.sql` enforces it in the DB — its own
`MAX_DEPTH` comment concedes "corrupt pre-existing cycles" are possible.

If one ever exists, `buildTreeOrder.walk` recurses without a `visited` set. A
self-parent or 2-cycle produces an empty `roots` array and the phase renders
**blank**; a longer cycle reachable from a root overflows the stack and takes
down the whole Gantt. Not live today — cheap insurance.

---

## 3. Routing and information architecture (P2)

### 3.1 Five schedule surfaces across four nav groups, two of them duplicated

`ScheduleHub.jsx` was built to consolidate three nav entries into tabs. **The
standalone entries were never removed.**

| Surface | Sidebar group (`moduleRegistry.js:20-23`) | Launcher group (`:66-83`) | Route domain (`routes.js:69-77`) |
|---|---|---|---|
| ScheduleHub | SCHEDULE | **Field** | scheduling |
| ProjectCalendar | SCHEDULE *(also a Hub tab)* | **Field** | scheduling |
| LookAheadSchedule | SCHEDULE *(also a Hub tab)* | **Fab** | **fabrication** |
| ResourceScheduling | **FABRICATION** | **Resources** | scheduling |
| FieldPlan | **FIELD** | — | scheduling |

A PM opening the launcher to find the schedule looks under **Field**. The
Look-Ahead is under **Fab**. Crew Scheduling — the only surface that models
working days — is under **Fabrication**.

Recommend: one SCHEDULE nav entry (`ScheduleHub`), Calendar and Look-Ahead
reachable only as tabs, Crew Scheduling promoted into the Hub as a fourth tab,
and the launcher groups corrected to match the sidebar.

### 3.2 The Look-Ahead tab is a second, disconnected schedule

`LookAheadSchedule.jsx` writes to the **`look_ahead` table**, not
`schedule_tasks`. Its own `activity`, `crew`, `planned_start`, `planned_end`,
`forecast_start`, `forecast_end`, `percent_complete` — **no `schedule_task_id`,
no link of any kind.**

So the Schedule tab has a `LookaheadPlanner` view driven by real tasks, and the
Look-Ahead *tab* is a hand-typed parallel schedule with the same name. Two
things called "Look-Ahead", one shell, different data.

**Production: 2 rows.** Nobody is maintaining it, which is the correct response
to a form that duplicates work.

Recommend: delete the standalone page, or reduce it to a *view* over
`schedule_tasks` filtered to the next 3 weeks, with the constraint
acknowledgement it already has (`:60-80` — that part is good and worth keeping).

### 3.3 Page state is not in the URL

- `?phase=` is read **once** at mount (`Schedule.tsx:34`, a `useState`
  initializer) and never written back. Change the filter and the URL is stale;
  refresh or share the link and the filter is gone. A second deep-link to the
  same route with a different phase is ignored.
- `view` (Gantt / Lookahead / List) is component state only. Refresh always
  returns to Gantt.
- `ScheduleHub`'s own tab **is** in the URL (`?sched_tab=`), so the two levels
  behave differently.
- `ViewTabs.tsx` buttons carry no `role="tab"` / `aria-selected`; `ScheduleHub`'s
  do.

Everything else is sound: `/Schedule` and `/GanttChart` redirect to
`/ScheduleHub` preserving search and hash (`AppRoutes.jsx:80-88`), the page is
`projectScoped`, `useResetOnProjectChange` clears all ten modals and selections
on project switch, and `useAutoOpenEdit` opens `?recordId=` correctly.

Minor: `STATIC_ROUTE_METADATA` marks the two redirects `lifecycle: "legacy"`,
which is not a member of the frozen `ROUTE_LIFECYCLES` array (`routes.js:9,15`).

---

## 4. Adding and editing tasks (the "simplistic as can be" ask)

### 4.1 The two add paths are backwards

`BulkAddTaskModal` is the **better** editor and it is behind the secondary
button: a spreadsheet grid with arrow-key cell navigation (`:304-399`), a real
**duration** field that auto-computes the finish (`:12-27`), and paste-friendly
rows.

`AddTaskModal` — the primary "+ New Task" — has:

- **No duration field.** You must type both dates by hand.
- **No predecessor field.** Create, then reopen the drawer to link it. Two steps
  for the most common thing you do after adding a task.
- **A flat `<select>` of every task on the project** for Parent Task
  (`:104-110`), unsearchable — while `SearchableTaskPicker.tsx` exists and is
  used elsewhere.
- **No Enter-to-submit and no Escape-to-close.** (No `<form>` is correct per
  house rules, but the keyboard handlers were never added; the Task List inline
  editor does this properly at `ScheduleTaskList.jsx:151`.)
- **Both dates defaulted to UTC-today** (§2.5) — tomorrow, after 5 PM.
- **A different status list than Bulk Add**: `Delayed`/`On Hold` here,
  `On Hold`/`Cancelled` there. Neither matches the other and both feed the same
  CHECK constraint and the same quick filters.

Recommend: make `New Task` a single row of the Bulk Add grid — name, duration,
start, predecessor, phase — with Enter to save and Enter-again to add the next
row. One vocabulary for status, shared from `utils/phases.js`-style constants.

### 4.2 Four write paths, no undo, no optimistic update

`updateTaskMut` (`useScheduleMutations.ts:77`) is the canonical path, but
`ScheduleBody.tsx:237` (Gantt) and `:286` (Task List) each **inline their own**
`entities.ScheduleTask.update` + `invalidateEntity` + toast, bypassing the
mutation's pending state and `toUserErrorMessage` mapping. Bar drag is a fourth
entry point through the Gantt's `onSave`.

Validation is fine — all four funnel through
`sanitizeScheduleTaskUpdatePayload`, which calls `assertScheduleDateRange`. But:

- **No optimistic update.** Every edit round-trips before the bar moves.
- **No undo.** Bulk Delete is a confirm dialog and then it's gone. (Soft delete
  covers the row, but nothing in the UI restores it.)
- Bulk Add (`useScheduleMutations.ts:312`) is a **sequential await loop** with no rollback — a failure
  at row 40 of 60 leaves 39 tasks and a generic error that doesn't say so.

### 4.3 Smaller edit-path gaps

- **`handleDurationChange`** (`TaskDetailDrawer.jsx:107`) rejects `days < 1`, so
  a milestone (0-day) cannot be entered by duration.
- **Milestone is three columns** — `task_type === 'Milestone'`, `is_milestone`,
  `milestone` — OR'd by one reader (`scheduleTaskUtils.js:55`). Add Task writes
  the first, the importer writes the third. They agree in production today (0
  splits) but nothing keeps them in sync.
- **Assignment is four columns** — `resource_names`, `assigned_to`, `crew_id`,
  `crew_name`. `taskOwner` reads the first two, Bulk Resource writes
  `resource_names`, Crew Scheduling uses the crew pair.
- **`displayPct` maps NULL to 0** (`scheduleTaskUtils.js:35`), rendering "unknown
  progress" as an affirmative "0%" — the pattern CLAUDE.md bans. Zero live rows
  today (`pct_null = 0`), so this is P3, but `isStalledTask` (`scheduleGanttHelpers.ts:160`) keys off
  `displayPct(task) === 0` and will report unknown-progress tasks as stalled the
  moment one appears.

---

## 5. Imports and exports (P2)

### 5.1 Re-importing a schedule duplicates it

`commitImportedScheduleTasks` (`commitImportedTasks.ts:53-88`) is **create-only**.
There is no match on `uid`, `wbs_code` or name, and no update branch.

The normal workflow — the GC issues a monthly schedule update and you re-import
it — **doubles the schedule**. This is the same failure class CLAUDE.md already
documents for the model roster ("`bulkCreate` (a plain insert, no upsert)…
silently duplicates the whole roster"), on the primary way a real schedule gets
into the system.

Also: the loop is a sequential `await` per row with no transaction, and the
predecessor-link pass runs only **after** every insert succeeds — so a failure
partway leaves tasks with no logic at all.

### 5.2 A P6 export can load baseline dates as live dates

`buildColumnIndex` (`importScheduleCsv.ts:119-139`) is first-match-wins scanning
left to right, and the `start` alias list includes **`"baseline start"`**
(`:73-76`); `finish` likewise. A P6 layout that places baseline columns before
current ones binds `start`/`finish` to the **baseline**, and the import silently
loads the as-planned dates as the live schedule.

`phase` also aliases `"area"` — a P6 Area column becomes the phase and then
mostly fails phase normalization into "Fabrication".

### 5.3 A missing finish is invented, not left TBD

`commitImportedTasks.ts:70` — `end_date: t.finish ?? t.start ?? null`. A row with
a start and no finish becomes a 0-day task rather than staying TBD. That is
"absence is not evidence": the schedule asserts a finish nobody supplied.

Exports are correct: `handleExportIcs` and `handleExportPdf`
(`useScheduleMutations.ts:372,392`) both use `tasksWithEffective`, so the
calendar and the PDF agree with the Task List. (They therefore disagree with the
Gantt whenever §1.1 fires.)

---

## 6. Built, tested, and never wired up (P2)

### 6.1 The Blocking Fabrication Shield is not connected to the schedule

`src/services/scheduleGatekeeper.ts` is a complete, unit-tested, pure
implementation of exactly the S&H rule: *an unresolved Critical RFI on a work
package blocks its fabrication/delivery/erection tasks; a High one warns.*
`scheduleCascade.ts` even exposes `applyScheduleGates` and
`applyEffectiveDatesWithGates` to overlay it in one pass.

**`evaluateTaskGate`, `buildGateMap`, `applyScheduleGates` and
`applyEffectiveDatesWithGates` have zero callers in the entire app.** The only
export in use is `summarizeBlockingConstraints`, and only by
`LookAheadSchedule.jsx:19` — the page with 2 rows in it — at project level, not
per task.

The Gantt does not know a task is blocked by an open RFI. This is the highest
value-per-hour fix in the audit: the logic exists, it is tested, it just needs
`applyScheduleGates` in `Schedule.tsx` and a badge on the row.

### 6.2 Dead UI and dead props

- **Delivery overlay**: `ScheduleGantt.jsx` carries 25 references to a delivery
  overlay — `showDeliveries` toggle, `collapsedDeliveries`, delivery rows,
  layout math — and **`ScheduleBody` never passes a `deliveries` prop**. It
  defaults to `[]` and can never render. `Schedule.tsx:108-116` documents the
  deliberate removal; the chrome was left behind.
- **`expandedTask` / `setExpandedTask`**: state in `Schedule.tsx:29`, reset on
  project change, threaded through `bodyProps` into `<ScheduleGantt>`
  (`ScheduleBody.tsx:234`) — and **ScheduleGantt does not declare or use
  either**.
- **`pctComplete={undefined}`** is passed explicitly from `Schedule.tsx:332`, so
  the hero always falls back to the unweighted summary value (§2.3).
- **`void view;`** (`useScheduleMutations.ts:414`) — a parameter kept only to
  silence the linter.

### 6.3 What is genuinely solid — do not regress this

- **`scheduleCascade.ts`** — full FS/SS/FF/SF + signed lag, legacy shape
  upgraded on read, self-reference dropped, correct cycle-member identification
  (only the members, not the ancestors that found them), module-scoped warning
  dedupe, sane year clamp, UTC-safe arithmetic throughout. Excellent module; the
  bug is *where it is called from*, never its math.
- **`hierarchy.js` + `reparentTasks.js`** — batch-validated before any write,
  sequential writes, audited, one shared path for drag / drawer / bulk.
- **`20260707061933_schedule_summary_rollup.sql`** — correct AFTER-row rollup,
  terminates on `IS DISTINCT FROM`, handles reparent and delete, depth guard,
  project-scoped, `SECURITY DEFINER` with explicit `search_path` and `REVOKE`,
  bottom-up backfill by node height. Textbook.
- **Virtualized rendering** (`scheduleGanttDerive.ts`), resizable persisted
  columns, `parseDateUTC` year clamping (a "0026-06-15" typo can't build a
  2,000-year timeline), and the `ListTruncationNotice` cap correctly set to
  `EFFECTIVE_LIST_CAP` (1000, not the requested 2000).
- 28 test files / 258 tests, all green.

---

## 7. Recommended features

Ordered by value to a steel PM. The first four are what turn this from a
picture of a schedule into a defensible one.

### 7.1 Actuals + variance (unlocks everything else)

Add `actual_start_date` / `actual_finish_date`. Status → In Progress prompts for
actual start; → Complete prompts for actual finish (defaulting to today,
editable). Then ship a **variance column**: Baseline / Current / Actual / Var
(days), per task and rolled to the project. This is the report the GC asks for
and the one you need when they claim you drove the delay.

### 7.2 Real baseline management

A `schedule_baselines` table: `id, project_id, name, set_by, set_at, reason` and
a `schedule_baseline_tasks` snapshot. Keep Baseline 0 (contract) forever, add one
per approved time extension, and let the Gantt draw any two against each other.
Never overwrite. Never snapshot cascaded dates.

### 7.3 Calculated critical path and float

Backward pass over the graph the cascade already walks → `total_float`,
`free_float`, `is_critical = total_float <= 0`. Replace the manual checkbox with
the calculation (keep the flag as a manual override with a distinct badge).
Then: a **longest-path filter**, a **float column**, and *near-critical* (float
≤ 5d) highlighting — which is where steel jobs actually get hurt.

### 7.4 A working-day calendar per project

`project_calendars`: work days, shift pattern (5×8, 4×10, 6-day), and a holiday
list. Every duration, lag and drag snaps to it. Reuse `lib/workweek.js` so the
Gantt and Crew Scheduling finally agree. Show non-work days shaded (the Gantt
already has `GANTT_WEEKEND_VAR`, it just doesn't drive the math).

### 7.5 Wire up the constraint gate (already built — §6.1)

A red bar and a "Blocked — RFI 042" badge on any fab/delivery/erection task
whose work package has an unresolved Critical RFI, and a hard block on marking it
In Progress without an acknowledgement. Add the same for un-IFC drawings and
unreleased fab packages via `isPackageReleasedForFab`.

### 7.6 Change history and a schedule-change log

Log every date-bearing write with old → new, author, and an optional reason.
Then a per-task "History" tab in the drawer and a project-level **Schedule
Change Log** export — the single artifact that wins a delay argument.

### 7.7 Two-schedule comparison ("what changed since last week?")

Given baselines exist, diff any two: tasks added, deleted, dates moved, logic
changed. Post it as a weekly digest. This is what a PM actually needs Monday
morning and what the Rivet brief is reaching for.

### 7.8 Sequence / lift and load-list integration

Steel schedules are driven by erection sequence, not phases. Let a task carry a
sequence/lift number and roll up tonnage and piece count from the Piece Register.
Then "Sequence 3 is 60% detailed, 20% fabricated, 0% delivered" comes out of the
schedule instead of a spreadsheet.

### 7.9 Resource-loaded scheduling

Shop hours per task from Budget Hours, crew size per erection task, and a
histogram showing where you are over capacity. `ResourceScheduling` already has
the workday math; it just has no link to `schedule_tasks`.

### 7.10 Schedule-driven procurement and delivery alerts

Every Fabrication task needs material on hand. Tie tasks to mill orders and
deliveries and flag "task starts in 12 days, material ETA is 19 days out." The
`Deliveries` and `Procurement` tables already exist.

### 7.11 Field progress capture

`FieldToday` already writes `percent_complete` (`FieldToday.jsx:101`). Extend it:
pieces erected today → actual progress on the erection task, with the daily log
as the evidence trail. Progress stops being a guess.

### 7.12 Editor quality-of-life

- Undo toast on every destructive/bulk action.
- Optimistic bar movement on drag.
- Copy/paste rows, duplicate task, insert-below.
- Multi-select drag on the Gantt.
- Keyboard: `N` new task, `E` edit, `Del` delete, `/` search.
- A **link mode** — click predecessor, click successor, pick FS/SS/FF/SF.
  Dependencies are currently drawer-only.

---

## 8. Suggested remediation order

**Batch 1 — stop showing wrong numbers (P1, small diffs)**

1. Gantt consumes `effectiveDatesMap` from `Schedule.tsx`; cascade over all
   tasks, filter for display. (§1.1)
2. Rivet brief classifies overdue/due-soon from effective dates. (§1.2)
3. `ProjectCalendar` applies `applyEffectiveDates`. (§1.2)
4. Set Baseline / Update Scheduled Dates operate on the unfiltered list. (§1.5)
5. Cascade-held bars refuse the drag with an explanatory toast. (§2.6)

**Batch 2 — make it defensible (P1)**

6. ~~`logActivity` on every date-bearing write~~ — superseded: extend
   `record_planner_action_event` to cover DELETE and the fields it missed,
   and surface the trail that already exists. (§1.3, §7.6)
7. `actual_start_date` / `actual_finish_date` + status prompts. (§1.4)
8. Predecessor cleanup on delete + a one-off repair of the 26 orphans. (§1.6)
9. `schedule_baselines` tables; migrate the 19 metadata baselines. (§1.5, §7.2)

**Batch 3 — correct math (P2)**

10. Project working-day calendar wired into duration/lag/drag. (§2.1, §7.4)
11. Duration-weighted rollup and headline % complete. (§2.3)
12. One duration source of truth — derive it, drop the column or make it a
    generated column. (§2.4)
13. `todayLocalISO()` everywhere `new Date().toISOString()` appears. (§2.5)
14. Calculated float and critical path. (§2.2, §7.3)

**Batch 4 — add/edit simplicity (the explicit ask)**

15. New Task = one Bulk-Add row: name, duration, start, predecessor, phase;
    Enter saves and opens the next. (§4.1)
16. `SearchableTaskPicker` for parent and predecessor everywhere. (§4.1)
17. One status vocabulary, one milestone flag, one assignment field. (§4.3)
18. Collapse the four write paths onto `updateTaskMut`; add optimistic updates
    and an undo toast. (§4.2)

**Batch 5 — imports, IA, cleanup (P2/P3)**

19. Importer matches on `uid`/`wbs_code` and updates instead of duplicating;
    preview shows create/update/skip counts. (§5.1)
20. Exact-match column binding before alias fallback; never bind `start` to
    "baseline start". (§5.2)
21. One SCHEDULE nav entry; Crew Scheduling becomes a Hub tab; launcher groups
    corrected. (§3.1)
22. Retire or re-point the standalone Look-Ahead page. (§3.2)
23. `?phase=` and `?view=` in the URL; `role="tab"` on `ViewTabs`. (§3.3)
24. Delete the dead delivery overlay, `expandedTask`, `pctComplete`,
    `void view`. (§6.2)
25. `visited` guard in `buildTreeOrder`. (§2.8)
26. Regenerate `src/types/supabase.ts` — it predates
    `20260707120000_look_ahead_activity_columns.sql` and is missing those
    columns.
