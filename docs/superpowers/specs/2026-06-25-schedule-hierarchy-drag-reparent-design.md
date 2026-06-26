# Schedule Hierarchy Overhaul — Drag‑to‑Reparent + Integrity Backstop

**Date:** 2026-06-25
**Status:** Approved design — pending implementation plan
**Area:** Scheduling / Gantt (moat-adjacent: basic schedule + field progress)

---

## 1. Problem & Goals

A full audit of the Gantt/scheduling stack surfaced one root defect and a cluster of
parent‑child (WBS hierarchy) friction points.

**Root defect — two divergent Gantt pages (split‑brain):**

- `src/pages/Schedule.tsx` → `src/components/schedule/ScheduleGantt.jsx` stores hierarchy
  in the real **`schedule_tasks.parent_task_id` column** and dependencies in the
  **`dependencies` column**, and feeds the tested cascade engine
  (`src/services/scheduleCascade.ts`).
- `src/pages/GanttChart.tsx` (a separate registered route, "Gantt Chart") stores
  hierarchy in **`metadata.parent_id`** and dependencies in **`metadata.dependencies`**
  (JSONB blob), invisible to the cascade, summary rollups, look‑ahead, and exports.

Hierarchy created in one page is silently ignored by the other.

**Production reality (verified 2026-06-25):** 291 `schedule_tasks` rows —
52 use `parent_task_id`, 175 use the `dependencies` column, and **0 rows** have
`metadata.parent_id` or `metadata.dependencies` set. The `GanttChart.tsx` model holds
**no real data** and can be retired with no migration.

**Reparenting friction (the second ask — "make assigning children to parents easier"):**

- The canonical Gantt only nests under the *immediately preceding* row (indent button /
  Tab); nesting under a non‑adjacent parent requires reordering first or repeated indents.
- `TaskDetailDrawer` has **no** way to change a task's parent.
- No drag‑to‑reparent, no multi‑select reparent.
- Cycle prevention exists only in `GanttChart.tsx` (the page being retired); the create
  modals and drawer have none, so a task can be made its own ancestor and silently break
  the cascade.

### Goals

1. One canonical Gantt hierarchy model (`parent_task_id` + `dependencies` columns).
2. Drag‑and‑pull as the primary way to reparent and reorder tasks.
3. Two targeted fallbacks for what drag handles poorly (drawer picker, bulk set‑parent).
4. Authoritative cycle/integrity protection at the DB boundary, plus clean client‑side
   prevention.
5. Audit every parent change (structural mutation), per the Tier‑1 audit push.

### Non‑goals (explicit, YAGNI — tracked as follow‑ups, not built here)

- Drag‑to‑link dependencies.
- `start_date ≤ end_date` DB constraint.
- Optimistic updates for schedule mutations.
- Narrowing the broad cache invalidation on `schedule_task` writes.

---

## 2. Architecture

A small shared hierarchy layer is built **once** and consumed by every reparent surface,
rather than each surface re‑implementing the logic (the pattern that caused the
split‑brain). Lighter alternative (client‑only guard, no shared service) and heavier
alternative (full transactional RPC for every move) were both rejected — the first is too
weak given the server‑boundary rule, the second is overkill at ~291 tasks/project.

### 2.1 Shared hierarchy core (new) — `src/lib/schedule/hierarchy.js`

Pure, dependency‑free, unit‑tested. No React, no DB, no clock.

- `wouldCreateCycle(tasks, childId, newParentId): boolean`
  Walks the ancestor chain of `newParentId`; returns `true` if `newParentId === childId`
  (self‑parent) or `childId` appears among `newParentId`'s ancestors (would make the child
  its own ancestor). Ports the verified check from `GanttChart.tsx:230‑242`.
- `validReparentTargets(tasks, childId): Set<string>`
  The set of task ids that are legal parents of `childId` (excludes self and all
  descendants of `childId`). Used to filter the drawer + bulk pickers.
- `computeSiblingSortOrder(tasks, newParentId, dropIndex): number`
  - **Nest drop** (`dropIndex == null`): append → `max(sibling.sort_order) + 1000`
    (1000 when no siblings).
  - **Gap drop** (`dropIndex` provided): midpoint between the two neighbor siblings'
    `sort_order` values; if dropping at an end, `neighbor ± 1000`. Handles null neighbor
    `sort_order` by seeding `1000`/`2000` (mirrors existing `swapOrder` seeding).

### 2.2 Audited writer — schedule mutation layer

`reparentTasks(taskIds, newParentId, { dropIndex } = {})` (lives with the Schedule
mutations, e.g. a small `src/lib/schedule/reparent.js` or co‑located in the page's
mutation module — final home decided in the plan):

- Validates each id via `wouldCreateCycle`; rejects the whole batch with a toast if any
  would cycle (no partial structural change).
- Computes `sort_order` via `computeSiblingSortOrder`.
- Writes **sequentially** (not parallel) through `entities.ScheduleTask.update` — this
  also fixes the existing `swapOrder` double‑click race (two parallel `onSave`s reading
  the same local `sort_order`).
- Logs each change via `src/services/auditLogger.ts`: actor, task id/name,
  `old parent → new parent`.
- Single reparent and bulk reparent share this one path.

### 2.3 Database — one migration

`BEFORE INSERT OR UPDATE OF parent_task_id ON schedule_tasks` trigger
`prevent_schedule_task_cycle()`:

- Fires only when `parent_task_id` is set/changed.
- Rejects self‑parent (`NEW.parent_task_id = NEW.id`).
- Walks the ancestor chain from `NEW.parent_task_id`; `RAISE EXCEPTION` if `NEW.id` is
  encountered (cycle) or the walk exceeds a sane depth guard.
- `SECURITY DEFINER`, explicit `search_path = public`, minimal grants.
- Authoritative backstop behind the client guard — also protects direct API / import
  writes that bypass the UI.
- Committed to `supabase/migrations/` with the **filename matching the recorded
  migration version** (migration‑lockstep rule), applied via Supabase MCP `apply_migration`.

---

## 3. UI — interaction model

### 3.1 Drag‑to‑reparent (primary) — left task‑list panel only

A new `useTaskRowDnD` hook (sibling to `useTaskBarDrag`). The **timeline bar drag**
(date moves) is untouched — drag lives only in the left label/row panel, so the two
gestures never conflict.

- **Drop ON a row** → that row highlights as the prospective parent → on drop the dragged
  task is nested as its child (`reparentTasks([dragId], targetRowId)`).
- **Drop IN the gap** between two rows → a horizontal insert line shows → on drop the task
  is reordered as a sibling at that position (`reparentTasks([dragId], targetParentId,
  { dropIndex })`, where `targetParentId` is the gap's containing parent).
- **Edge auto‑scroll** — dragging near the top/bottom edge of the list scrolls it so
  off‑screen parents are reachable.
- Invalid targets (self/descendant, computed via `validReparentTargets`) show a
  "no‑drop" cursor and are rejected on drop.

**Replaces:** the ▲▼ move buttons, the indent/outdent (◂▸) buttons, Tab/Shift‑Tab
keyboard indent, and the click‑to‑pick‑parent flow. Those handlers and their helpers
(`handleMoveUp/Down`, `handleIndent/Outdent`, `computeIndentTarget`, `computeOutdentTarget`,
`swapOrder`, the Tab key handling) are removed from `ScheduleGantt.jsx`.

### 3.2 TaskDetailDrawer parent picker (fallback)

A searchable "Parent task" field in the drawer's DETAILS tab, reusing the existing
`SearchableTaskPicker`. Options filtered by `validReparentTargets(allTasks, task.id)`.
Selecting writes through `reparentTasks([task.id], chosenParentId)`. This is also the
**keyboard‑accessible** reparent path.

### 3.3 Bulk "Set parent…" (fallback)

A new action in the multi‑select toolbar → searchable parent picker (filtered to targets
valid for *all* selected tasks) → `reparentTasks(selectedIds, parentId)`. Selected tasks
keep their relative order under the new parent.

### 3.4 Retire `GanttChart.tsx`

- Remove the page component, its `config/routes.js` registry entry, and any nav link.
- Redirect the old `GanttChart` route path to `Schedule` so existing bookmarks/deep‑links
  don't 404.
- Safe: 0 production rows use its `metadata` hierarchy/dependency model. Its good ideas
  (cycle check, pick‑parent) are absorbed into the shared core above.

---

## 4. Accessibility note (recorded, accepted)

Removing Tab/▲▼ means sibling **reordering** loses its pure‑keyboard path. **Reparenting**
remains keyboard‑accessible via the drawer picker. Accepted given the explicit
drag‑first preference; documented here so it's a known, deliberate trade‑off rather than a
regression. A keyboard reorder affordance can be revisited as a follow‑up if needed.

---

## 5. Data & write semantics summary

- Hierarchy authority: `schedule_tasks.parent_task_id` (FK self‑ref, `ON DELETE SET NULL`).
- Ordering: `schedule_tasks.sort_order`; gap‑drop = midpoint, nest‑drop = append.
- Summary/rollup display unchanged — `buildTreeOrder` (`scheduleTree.js`) keeps rolling up
  dates/%/duration for tasks that gain children; reparenting changes only `parent_task_id`
  and `sort_order`, never stored dates.
- Cascade unchanged — `computeEffectiveDates` continues to read the `dependencies` column.
- Reparent writes are sequenced and audited; cycles rejected client‑side and at the DB.

---

## 6. Testing

- **Unit** (`hierarchy.js`): cycle detection incl. deep/multi‑level chains, self‑parent,
  sibling vs descendant; `computeSiblingSortOrder` nest‑append and gap‑midpoint incl. null
  neighbors and end positions; `validReparentTargets` excludes self + all descendants.
- **Unit/integration** (trigger): cycle and self‑parent rejected at the DB; legal reparent
  accepted.
- **Component** (jsdom, mocked supabase): drawer parent picker writes `parent_task_id`;
  bulk "Set parent" reparents the selection; invalid targets filtered out.
- **Field verification** (required before "done", per the field‑verified bar): in the
  running app — drag‑nest onto a row, gap‑reorder, edge auto‑scroll to a far parent,
  drawer reparent, bulk reparent, and confirm the DB trigger rejects a hand‑made cycle.

---

## 7. Out of scope / follow‑ups (from the audit, not built here)

- Drag‑to‑link dependency creation in the canonical Gantt (wire `GanttContextMenu` or a
  bar‑edge linker).
- `start_date ≤ end_date` validation (DB CHECK or app‑level).
- Optimistic updates for schedule mutations (reduce 1–2s edit lag).
- Narrow the `schedule_task` cache invalidation (currently ~11 query families per edit).
- Transactional bulk import/WBS‑builder writes (partial‑write risk on failure).
