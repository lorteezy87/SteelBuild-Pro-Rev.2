# Schedule Hierarchy Drag-to-Reparent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make assigning child tasks to parents easy via drag-and-pull in the Schedule Gantt, backed by one shared hierarchy core, an authoritative DB cycle guard, and an audited write path — and retire the divergent second Gantt page.

**Architecture:** A pure, unit-tested helper module (`src/lib/schedule/hierarchy.js`) owns all cycle/sort-order/target logic. One audited writer (`reparentTasks`) is the single mutation path, consumed by three UI surfaces: drag-and-drop in `ScheduleGantt` (primary), the `TaskDetailDrawer` parent picker, and a bulk "Set parent" action. A Postgres `BEFORE INSERT/UPDATE` trigger rejects cycles at the DB boundary. `GanttChart.tsx` (which stored hierarchy in an unused `metadata.parent_id` blob — 0 production rows) is removed and its route redirected to `Schedule`.

**Tech Stack:** Vite + React, TanStack Query, Supabase Postgres, Vitest, native HTML5 drag-and-drop (the house pattern — see `src/components/drawings/DrawingKanban.jsx`), `src/services/auditLogger.ts`.

**Spec:** `docs/superpowers/specs/2026-06-25-schedule-hierarchy-drag-reparent-design.md`

**Branch:** Work on `claude/schedule-drag-reparent` (do NOT commit to `main` until the user asks to ship). Run the validation ladder before any merge.

**Source-of-truth facts (verified):**
- DB column for hierarchy: `schedule_tasks.parent_task_id` (uuid, nullable, self-FK `ON DELETE SET NULL`). Ordering: `schedule_tasks.sort_order` (integer, nullable).
- RLS: insert/update/delete require `user_has_project_role_at_least(project_id, 'field')`.
- Tree builder: `src/components/schedule/scheduleTree.js` `buildTreeOrder()` reads `parent_task_id` + `sort_order`, sets `_depth`, `_hasChildren`.
- Drawer save callback: `onUpdate({ id, ...fields })` patches ANY task (see `TaskDetailDrawer.jsx:436`).
- `SearchableTaskPicker({ tasks, onSelect, placeholder })` calls `onSelect(taskId)` (`TaskDetailDrawer.jsx:89`).
- Gantt save callback: `ScheduleGantt` receives `onSave={async (data) => …}` from `Schedule.tsx:865` → `updateTaskMut` → `entities.ScheduleTask.update(id, fields)`.
- Bulk pattern: `batchProcess(ids, fn)` (`src/lib/batchProcess.js`) returns `{ succeeded, failed }`.

---

## Task 1: Pure hierarchy core (`src/lib/schedule/hierarchy.js`)

**Files:**
- Create: `src/lib/schedule/hierarchy.js`
- Test: `src/lib/schedule/__tests__/hierarchy.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/schedule/__tests__/hierarchy.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import {
  wouldCreateCycle,
  validReparentTargets,
  computeSiblingSortOrder,
} from "../hierarchy";

// a → b → c (c child of b, b child of a)
const tasks = [
  { id: "a", parent_task_id: null, sort_order: 1000 },
  { id: "b", parent_task_id: "a", sort_order: 1000 },
  { id: "c", parent_task_id: "b", sort_order: 2000 },
  { id: "d", parent_task_id: "a", sort_order: 3000 },
];

describe("wouldCreateCycle", () => {
  it("rejects self-parent", () => {
    expect(wouldCreateCycle(tasks, "a", "a")).toBe(true);
  });
  it("rejects making a node a child of its own descendant", () => {
    // make a a child of c → c is a descendant of a → cycle
    expect(wouldCreateCycle(tasks, "a", "c")).toBe(true);
  });
  it("allows a legal reparent", () => {
    // make d a child of c → no cycle
    expect(wouldCreateCycle(tasks, "d", "c")).toBe(false);
  });
  it("allows reparent to root (null)", () => {
    expect(wouldCreateCycle(tasks, "c", null)).toBe(false);
  });
  it("does not infinite-loop on pre-existing corrupt cycle data", () => {
    const corrupt = [
      { id: "x", parent_task_id: "y" },
      { id: "y", parent_task_id: "x" },
    ];
    expect(wouldCreateCycle(corrupt, "z", "x")).toBe(false);
  });
});

describe("validReparentTargets", () => {
  it("excludes self and all descendants", () => {
    const targets = validReparentTargets(tasks, "a");
    expect(targets.has("a")).toBe(false); // self
    expect(targets.has("b")).toBe(false); // descendant
    expect(targets.has("c")).toBe(false); // descendant
    expect(targets.has("d")).toBe(false); // descendant
  });
  it("includes legal parents", () => {
    const targets = validReparentTargets(tasks, "d");
    expect(targets.has("b")).toBe(true);
    expect(targets.has("c")).toBe(true);
    expect(targets.has("d")).toBe(false); // self
  });
});

describe("computeSiblingSortOrder", () => {
  it("appends after last sibling on a nest drop (dropIndex null)", () => {
    // children of a are b(1000) and d(3000) → append → 4000
    expect(computeSiblingSortOrder(tasks, "a", null)).toBe(4000);
  });
  it("returns 1000 when the new parent has no children", () => {
    expect(computeSiblingSortOrder(tasks, "c", null)).toBe(1000);
  });
  it("returns a midpoint between neighbors on a gap drop", () => {
    // insert among root-level siblings: only "a" (1000) is root → dropIndex 1 (after a)
    const roots = [{ id: "a", parent_task_id: null, sort_order: 1000 }, { id: "e", parent_task_id: null, sort_order: 3000 }];
    expect(computeSiblingSortOrder(roots, null, 1)).toBe(2000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schedule/__tests__/hierarchy.test.js`
Expected: FAIL — "Failed to resolve import '../hierarchy'".

- [ ] **Step 3: Write the implementation**

Create `src/lib/schedule/hierarchy.js`:

```javascript
// Pure hierarchy helpers for schedule_tasks parent/child (WBS) editing.
// No React, no DB, no clock — testable in isolation and reused by every
// reparent surface (drag, drawer picker, bulk). The single home for "is this
// reparent legal" + "where does sort_order land", so the logic can't drift
// between entry points (the bug that produced the two-Gantt split-brain).

const MAX_DEPTH = 10000; // guard against corrupt pre-existing cycles in data

/** Index tasks by id once. */
function indexById(tasks) {
  const byId = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (t && t.id) byId.set(t.id, t);
  }
  return byId;
}

/**
 * True if making `childId` a child of `newParentId` would create a cycle
 * (self-parent, or newParentId is a descendant of childId). Walks the
 * ancestor chain of the prospective parent looking for childId. A depth
 * guard makes it safe against already-corrupt cyclic data.
 */
export function wouldCreateCycle(tasks, childId, newParentId) {
  if (!childId) return false;
  if (!newParentId) return false; // reparent to root is always legal
  if (newParentId === childId) return true; // self-parent
  const byId = indexById(tasks);
  let cursor = byId.get(newParentId);
  const visited = new Set();
  let depth = 0;
  while (cursor && depth < MAX_DEPTH) {
    if (cursor.id === childId) return true;
    if (visited.has(cursor.id)) return false; // corrupt loop, not our concern
    visited.add(cursor.id);
    cursor = cursor.parent_task_id ? byId.get(cursor.parent_task_id) : null;
    depth += 1;
  }
  return false;
}

/** Set of all descendant ids of `rootId` (not including rootId). */
function descendantIds(tasks, rootId) {
  const childMap = new Map();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (!t || !t.id) continue;
    const p = t.parent_task_id;
    if (!p) continue;
    if (!childMap.has(p)) childMap.set(p, []);
    childMap.get(p).push(t.id);
  }
  const out = new Set();
  const stack = [...(childMap.get(rootId) || [])];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childMap.get(id) || []) stack.push(c);
  }
  return out;
}

/**
 * The set of task ids that are legal parents of `childId`: every task
 * except `childId` itself and its descendants. Used to filter parent
 * pickers so an illegal target is never offered.
 */
export function validReparentTargets(tasks, childId) {
  const banned = descendantIds(tasks, childId);
  banned.add(childId);
  const out = new Set();
  for (const t of Array.isArray(tasks) ? tasks : []) {
    if (t && t.id && !banned.has(t.id)) out.add(t.id);
  }
  return out;
}

/** The direct children of `parentId` (null = root-level), sorted by sort_order. */
function siblingsOf(tasks, parentId) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((t) => t && (t.parent_task_id ?? null) === (parentId ?? null))
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
}

/**
 * Compute the sort_order for a task being placed under `newParentId`.
 *   - Nest drop (dropIndex == null): append → max(sibling.sort_order)+1000.
 *   - Gap drop (dropIndex provided): midpoint between the siblings that
 *     straddle dropIndex; at an end, neighbor ± 1000.
 * Null sibling sort_orders are seeded so the result is always a finite number.
 */
export function computeSiblingSortOrder(tasks, newParentId, dropIndex) {
  const sibs = siblingsOf(tasks, newParentId);
  if (dropIndex == null) {
    if (!sibs.length) return 1000;
    const maxOrder = Math.max(...sibs.map((s) => s.sort_order ?? 0));
    return maxOrder + 1000;
  }
  const before = sibs[dropIndex - 1];
  const after = sibs[dropIndex];
  const beforeOrder = before?.sort_order ?? null;
  const afterOrder = after?.sort_order ?? null;
  if (beforeOrder == null && afterOrder == null) return 1000;
  if (beforeOrder == null) return afterOrder - 1000;
  if (afterOrder == null) return beforeOrder + 1000;
  return Math.round((beforeOrder + afterOrder) / 2);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schedule/__tests__/hierarchy.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule/hierarchy.js src/lib/schedule/__tests__/hierarchy.test.js
git commit -m "feat(schedule): pure hierarchy core (cycle guard, sort-order, valid targets)"
```

---

## Task 2: DB cycle-prevention trigger (migration)

**Files:**
- Create (via MCP apply_migration, then commit the SQL file): `supabase/migrations/<recorded_version>_prevent_schedule_task_cycle.sql`

- [ ] **Step 1: Write the migration SQL**

Author this SQL (apply via the Supabase MCP `apply_migration`, name `prevent_schedule_task_cycle`):

```sql
-- Reject parent cycles on schedule_tasks at the DB boundary (defense in depth
-- behind the client-side guard). Walks the ancestor chain when parent_task_id
-- is set/changed; raises on self-parent or a cycle.
create or replace function prevent_schedule_task_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cursor_id uuid := NEW.parent_task_id;
  depth int := 0;
begin
  if NEW.parent_task_id is null then
    return NEW;
  end if;
  if NEW.parent_task_id = NEW.id then
    raise exception 'schedule_task % cannot be its own parent', NEW.id;
  end if;
  while cursor_id is not null and depth < 1000 loop
    if cursor_id = NEW.id then
      raise exception 'schedule_task % parent change would create a cycle', NEW.id;
    end if;
    select parent_task_id into cursor_id from schedule_tasks where id = cursor_id;
    depth := depth + 1;
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_prevent_schedule_task_cycle on schedule_tasks;

create trigger trg_prevent_schedule_task_cycle
  before insert or update of parent_task_id on schedule_tasks
  for each row
  execute function prevent_schedule_task_cycle();
```

- [ ] **Step 2: Apply via MCP**

Use Supabase MCP `apply_migration` with project ref `kjrwqagyeswwoxpjkcko`, name `prevent_schedule_task_cycle`, and the SQL above. Record the returned version.

- [ ] **Step 3: Verify the trigger rejects a cycle (read-only probe)**

Run via MCP `execute_sql` against a throwaway pair, then roll back — or simpler, assert the function exists and the trigger is attached:

```sql
select tgname from pg_trigger where tgname = 'trg_prevent_schedule_task_cycle';
```
Expected: one row.

Then prove rejection against real data (pick any task with a parent, attempt to set its parent to its own child) inside a transaction that is rolled back:

```sql
begin;
-- choose a parent p and one of its children c, then try to make p a child of c
-- (replace the ids from: select id, parent_task_id from schedule_tasks where parent_task_id is not null limit 1)
update schedule_tasks set parent_task_id = '<child_id>' where id = '<parent_id>';
rollback;
```
Expected: ERROR "would create a cycle"; rollback leaves data untouched.

- [ ] **Step 4: Commit the migration file**

Save the SQL to `supabase/migrations/<recorded_version>_prevent_schedule_task_cycle.sql` (filename == recorded version, per the migration-lockstep rule).

```bash
git add supabase/migrations/<recorded_version>_prevent_schedule_task_cycle.sql
git commit -m "feat(schedule): DB trigger preventing parent_task_id cycles"
```

---

## Task 3: Audited reparent writer + Schedule wiring

**Files:**
- Create: `src/lib/schedule/reparentTasks.js`
- Test: `src/lib/schedule/__tests__/reparentTasks.test.js`
- Modify: `src/pages/Schedule.tsx` (add a `reparentMut` and a `handleReparent` callback)

- [ ] **Step 1: Write the failing test (pure parts only — supabase mocked)**

Create `src/lib/schedule/__tests__/reparentTasks.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn();
const logActivityMock = vi.fn();

vi.mock("@/api/supabaseClient", () => ({
  entities: { ScheduleTask: { update: (...a) => updateMock(...a) } },
}));
vi.mock("@/services/auditLogger", () => ({
  logActivity: (...a) => logActivityMock(...a),
}));

import { reparentTasks } from "../reparentTasks";

const tasks = [
  { id: "a", parent_task_id: null, sort_order: 1000, task_name: "A" },
  { id: "b", parent_task_id: "a", sort_order: 1000, task_name: "B" },
  { id: "c", parent_task_id: "b", sort_order: 2000, task_name: "C" },
];

beforeEach(() => {
  updateMock.mockReset().mockResolvedValue({});
  logActivityMock.mockReset().mockResolvedValue();
});

describe("reparentTasks", () => {
  it("writes parent_task_id + sort_order for a legal nest", async () => {
    await reparentTasks(["c"], "a", { tasks });
    expect(updateMock).toHaveBeenCalledWith("c", expect.objectContaining({ parent_task_id: "a" }));
    const fields = updateMock.mock.calls[0][1];
    expect(typeof fields.sort_order).toBe("number");
  });

  it("rejects the whole batch if any id would cycle", async () => {
    // making a a child of c is a cycle (c is descendant of a)
    await expect(reparentTasks(["a"], "c", { tasks })).rejects.toThrow(/cycle|descendant/i);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("writes sequentially and audits each change", async () => {
    await reparentTasks(["b", "c"], null, { tasks });
    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(logActivityMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schedule/__tests__/reparentTasks.test.js`
Expected: FAIL — cannot resolve `../reparentTasks`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/schedule/reparentTasks.js`:

```javascript
import { entities } from "@/api/supabaseClient";
import { logActivity } from "@/services/auditLogger";
import { wouldCreateCycle, computeSiblingSortOrder } from "./hierarchy";

/**
 * Reparent one or many tasks under `newParentId` (null = root), writing
 * parent_task_id + a computed sort_order. Single audited path shared by the
 * Gantt drag, the drawer picker, and bulk "Set parent".
 *
 *  - Validates EVERY id first; if any would create a cycle the whole batch is
 *    rejected (no partial structural change).
 *  - Writes SEQUENTIALLY (avoids the parallel sort_order race the old
 *    swapOrder had) and logs each change via auditLogger.
 *
 * @param {string[]} taskIds
 * @param {string|null} newParentId
 * @param {{ tasks: any[], dropIndex?: number|null, projectId?: string, projectName?: string }} opts
 */
export async function reparentTasks(taskIds, newParentId, opts = {}) {
  const { tasks = [], dropIndex = null, projectId = null, projectName = null } = opts;
  const ids = (Array.isArray(taskIds) ? taskIds : []).filter(Boolean);
  if (!ids.length) return;

  const byId = new Map(tasks.map((t) => [t.id, t]));

  // Validate the entire batch before any write.
  for (const id of ids) {
    if (wouldCreateCycle(tasks, id, newParentId)) {
      throw new Error("That move would make a task its own descendant (cycle).");
    }
  }

  // Sequential writes. For a multi-task drop we append in selection order so
  // their relative ordering is preserved under the new parent.
  let order = computeSiblingSortOrder(tasks, newParentId, dropIndex);
  for (const id of ids) {
    const before = byId.get(id);
    await entities.ScheduleTask.update(id, {
      parent_task_id: newParentId,
      sort_order: order,
    });
    void logActivity("schedule_task", "updated", before || { id }, {
      projectId: projectId || before?.project_id || null,
      projectName,
      description: `Reparented ${before?.task_name || id} → ${
        newParentId ? byId.get(newParentId)?.task_name || newParentId : "top level"
      }`,
    });
    order += 1000; // keep multi-task drops in order
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schedule/__tests__/reparentTasks.test.js`
Expected: PASS.

- [ ] **Step 5: Wire a reparent mutation into `Schedule.tsx`**

In `src/pages/Schedule.tsx`, add an import near the other lib imports:

```typescript
import { reparentTasks } from "@/lib/schedule/reparentTasks";
```

After `updateTaskMut` (around line 245), add:

```typescript
  const reparentMut = useMutation({
    mutationFn: (vars: { ids: string[]; newParentId: string | null; dropIndex?: number | null }) =>
      reparentTasks(vars.ids, vars.newParentId, {
        tasks: enrichedTasks,
        dropIndex: vars.dropIndex ?? null,
        projectId: projectId || undefined,
      }),
    onSuccess: (_r, vars) => {
      invalidateEntity(qc, "schedule_task", projectId);
      setSelectedIds(new Set());
      toast.success(vars.ids.length > 1 ? `Reparented ${vars.ids.length} tasks` : "Task moved");
    },
    onError: (err: any) => toast.error(err?.message || "Reparent failed"),
  });
```

> Note: `enrichedTasks` is the raw tasks array already in scope (see the `tasksWithEffective`/`enrichedTasks` memos near line 215). Use it, NOT `tasksWithEffective`, so parent/sort_order are the stored values.

- [ ] **Step 6: Run full suite + build**

Run: `npx vitest run src/lib/schedule` then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20`
Expected: tests PASS; build EXIT 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/schedule/reparentTasks.js src/lib/schedule/__tests__/reparentTasks.test.js src/pages/Schedule.tsx
git commit -m "feat(schedule): audited reparentTasks writer + Schedule reparent mutation"
```

---

## Task 4: TaskDetailDrawer parent picker (fallback #1)

**Files:**
- Modify: `src/components/schedule/TaskDetailDrawer.jsx` (add a "Parent task" row to the DETAILS tab)

The drawer already has `allTasks`, `task`, and `onUpdate({ id, ...fields })`. Reuse the in-file `SearchableTaskPicker` and filter with `validReparentTargets`.

- [ ] **Step 1: Add the imports**

At the top of `TaskDetailDrawer.jsx`, add:

```javascript
import { validReparentTargets } from "@/lib/schedule/hierarchy";
```

- [ ] **Step 2: Derive the legal-parent list and current-parent label**

Inside the component body (near `availablePreds`, ~line 414), add:

```javascript
  const parentTargetIds = validReparentTargets(allTasks, task.id);
  const parentOptions = allTasks.filter((t) => parentTargetIds.has(t.id));
  const currentParent = task.parent_task_id
    ? allTasks.find((t) => t.id === task.parent_task_id)
    : null;
```

- [ ] **Step 3: Render the picker in the DETAILS tab**

In the DETAILS tab JSX (the same block that renders task name/type/phase fields, before the predecessor/successor section around line 762), add a labeled row. Match the surrounding `.sbd-*` / inline-style conventions used by the adjacent fields:

```jsx
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 4, fontFamily: "var(--font-mono)" }}>
            PARENT TASK
          </label>
          {currentParent ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {currentParent.wbs_code ? `${currentParent.wbs_code} — ` : ""}{currentParent.task_name}
              </span>
              <button
                onClick={() => onUpdate({ id: task.id, parent_task_id: null })}
                style={{ fontSize: 11, color: "var(--text-muted)", background: "transparent", border: "1px solid var(--divider)", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}
              >
                Promote to top level
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>Top level (no parent)</div>
          )}
          <SearchableTaskPicker
            tasks={parentOptions}
            onSelect={(id) => onUpdate({ id: task.id, parent_task_id: id })}
            placeholder="+ Set parent task…"
          />
        </div>
```

> `onUpdate` routes through `updateTaskMut` → `entities.ScheduleTask.update`, which the DB trigger (Task 2) backstops. No cycle can be offered because `parentOptions` already excludes self + descendants.

- [ ] **Step 4: Build + lint**

Run: `npm run lint 2>&1 | tail -20` then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20`
Expected: lint clean for the file; build EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/schedule/TaskDetailDrawer.jsx
git commit -m "feat(schedule): reparent a task from its detail drawer (parent picker)"
```

---

## Task 5: Bulk "Set parent" (fallback #2)

**Files:**
- Modify: `src/pages/schedule/BulkActionToolbar.tsx` (add a "Set Parent" button + props)
- Modify: `src/pages/Schedule.tsx` (state + a small picker modal + handler)

- [ ] **Step 1: Extend BulkActionToolbar props + button**

In `src/pages/schedule/BulkActionToolbar.tsx`, add to the interface:

```typescript
  parentPending: boolean;
  onSetParent: () => void;
```

Add them to the destructured params, and add a button next to "Edit Durations" (after line 86):

```tsx
      <button onClick={onSetParent} disabled={statusBusy} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--accent)", background: "rgba(86,176,255,0.12)", color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 10, cursor: statusBusy ? "not-allowed" : "pointer", opacity: statusBusy ? 0.6 : 1 }}>
        Set Parent
      </button>
```

- [ ] **Step 2: Add state + handler in Schedule.tsx**

Near the other bulk state (`showBulkResource`, etc.), add:

```typescript
  const [showBulkParent, setShowBulkParent] = useState(false);
```

The bulk reparent uses `reparentMut` from Task 3:

```typescript
  const bulkSetParent = (newParentId: string | null) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    reparentMut.mutate({ ids, newParentId });
    setShowBulkParent(false);
  };
```

- [ ] **Step 3: Pass the new props to BulkActionToolbar**

In the `<BulkActionToolbar ... />` usage (line 1033), add:

```tsx
          parentPending={reparentMut.isPending}
          onSetParent={() => setShowBulkParent(true)}
```

- [ ] **Step 4: Render a minimal parent-picker modal**

The chosen parent must be valid for ALL selected tasks. Compute the intersection of `validReparentTargets` across the selection. Add near the other modals (around line 990), gated on `showBulkParent`. Use the existing modal/picker primitives in the file (mirror the `BulkDatesModal` mount style); the option list is:

```typescript
  const bulkParentOptions = useMemo(() => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return [];
    // a task is a legal parent only if valid for every selected child
    let allowed: Set<string> | null = null;
    for (const childId of ids) {
      const v = validReparentTargets(enrichedTasks, childId);
      allowed = allowed ? new Set([...allowed].filter((x) => v.has(x))) : v;
    }
    const allowedSet = allowed || new Set<string>();
    // also exclude the selected tasks themselves
    ids.forEach((id) => allowedSet.delete(id));
    return enrichedTasks.filter((t: any) => allowedSet.has(t.id));
  }, [selectedIds, enrichedTasks]);
```

Add the import at the top of `Schedule.tsx`:

```typescript
import { validReparentTargets } from "@/lib/schedule/hierarchy";
```

Render (reuse `SearchableTaskPicker` — export it from TaskDetailDrawer or inline a `<select>`; simplest is a `<select>` to avoid a new export):

```tsx
      {showBulkParent && (
        <div onClick={() => setShowBulkParent(false)} style={{ position: "fixed", inset: 0, background: "rgba(1,4,10,0.6)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-surface-high)", border: "1px solid var(--accent-border)", borderRadius: 14, padding: 20, width: 420 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", marginBottom: 12 }}>
              SET PARENT FOR {selectedIds.size} TASK{selectedIds.size !== 1 ? "S" : ""}
            </div>
            <select
              className="sbd-select"
              defaultValue=""
              onChange={(e) => bulkSetParent(e.target.value || null)}
              style={{ width: "100%" }}
            >
              <option value="">— Top level (no parent) —</option>
              {bulkParentOptions.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.wbs_code ? `${t.wbs_code} — ` : ""}{t.task_name}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 14, textAlign: "right" }}>
              <button className="sbd-btn sbd-btn-ghost" onClick={() => setShowBulkParent(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add src/pages/schedule/BulkActionToolbar.tsx src/pages/Schedule.tsx
git commit -m "feat(schedule): bulk Set Parent for multi-selected tasks"
```

---

## Task 6: Drag-to-reparent in the Gantt left panel (primary)

**Files:**
- Create: `src/components/schedule/useTaskRowDnD.js`
- Modify: `src/components/schedule/ScheduleGantt.jsx` (wire DnD onto left-panel rows; REMOVE the old reorder/indent handlers + buttons + Tab keys)

This is the largest task. Native HTML5 DnD (house pattern: `src/components/drawings/DrawingKanban.jsx`). Drag lives ONLY in the left task-list panel rows — the timeline bar drag (`useTaskBarDrag`) is untouched.

**Interaction contract:**
- Each left-panel row is `draggable`. On `dragstart` it stores the dragged task id.
- A drop **on a row's body** (middle ~60% vertically) → nest: `reparentTasks([dragId], rowTaskId)` (dropIndex null). The row highlights.
- A drop **in the top/bottom ~20% band** of a row → reorder as sibling at that gap: `reparentTasks([dragId], rowTask.parent_task_id ?? null, { dropIndex })`. An insert line shows.
- Invalid targets (computed via `validReparentTargets(allTasks, dragId)`) show a no-drop state and ignore the drop.
- Edge auto-scroll: when the pointer is within 40px of the scroll container's top/bottom during drag, scroll it.

- [ ] **Step 1: Write the DnD hook with a unit test for its pure zone math**

Create `src/components/schedule/__tests__/useTaskRowDnD.test.js`:

```javascript
import { describe, it, expect } from "vitest";
import { dropZoneFor } from "../useTaskRowDnD";

describe("dropZoneFor", () => {
  // rect: top=100, height=40 → bands: <108 before, 108..132 nest, >132 after
  const rect = { top: 100, height: 40 };
  it("returns 'before' near the top edge", () => {
    expect(dropZoneFor(rect, 104)).toBe("before");
  });
  it("returns 'nest' in the middle", () => {
    expect(dropZoneFor(rect, 120)).toBe("nest");
  });
  it("returns 'after' near the bottom edge", () => {
    expect(dropZoneFor(rect, 136)).toBe("after");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/components/schedule/__tests__/useTaskRowDnD.test.js`
Expected: FAIL — cannot resolve `../useTaskRowDnD`.

- [ ] **Step 3: Implement the hook**

Create `src/components/schedule/useTaskRowDnD.js`:

```javascript
import { useCallback, useRef, useState } from "react";
import { validReparentTargets } from "@/lib/schedule/hierarchy";

/** Pure: which third of a row the pointer is over. */
export function dropZoneFor(rect, clientY) {
  const rel = (clientY - rect.top) / rect.height; // 0..1
  if (rel < 0.2) return "before";
  if (rel > 0.8) return "after";
  return "nest";
}

/**
 * Native HTML5 drag-and-drop for left-panel schedule rows.
 *
 * @param {object} args
 * @param {any[]} args.tasks        flat displayed rows (in render order, with _depth)
 * @param {(p: {ids: string[], newParentId: string|null, dropIndex?: number|null}) => void} args.onReparent
 * @param {() => HTMLElement|null} args.getScrollEl  returns the scroll container
 */
export function useTaskRowDnD({ tasks, onReparent, getScrollEl }) {
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // { id, zone }
  const validTargets = useRef(new Set());

  const onDragStart = useCallback((e, task) => {
    setDragId(task.id);
    validTargets.current = validReparentTargets(tasks, task.id);
    try { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; } catch {}
  }, [tasks]);

  const onDragOverRow = useCallback((e, task) => {
    if (!dragId || task.id === dragId) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const zone = dropZoneFor(rect, e.clientY);
    // nest requires a legal parent; reorder uses the row's parent, always legal-ish
    if (zone === "nest" && !validTargets.current.has(task.id)) {
      e.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";
    setDropTarget({ id: task.id, zone });
    // edge auto-scroll
    const sc = getScrollEl?.();
    if (sc) {
      const b = sc.getBoundingClientRect();
      if (e.clientY - b.top < 40) sc.scrollTop -= 12;
      else if (b.bottom - e.clientY < 40) sc.scrollTop += 12;
    }
  }, [dragId, getScrollEl]);

  const onDropRow = useCallback((e, task) => {
    e.preventDefault();
    const id = dragId;
    const target = dropTarget;
    setDragId(null);
    setDropTarget(null);
    if (!id || !target || task.id !== target.id || id === task.id) return;

    if (target.zone === "nest") {
      onReparent({ ids: [id], newParentId: task.id, dropIndex: null });
      return;
    }
    // reorder as sibling under the row's parent
    const parentId = task.parent_task_id ?? null;
    const sibs = tasks.filter((t) => (t.parent_task_id ?? null) === parentId);
    const rowIdx = sibs.findIndex((t) => t.id === task.id);
    const dropIndex = target.zone === "before" ? rowIdx : rowIdx + 1;
    onReparent({ ids: [id], newParentId: parentId, dropIndex });
  }, [dragId, dropTarget, tasks, onReparent]);

  const onDragEnd = useCallback(() => { setDragId(null); setDropTarget(null); }, []);

  return { dragId, dropTarget, onDragStart, onDragOverRow, onDropRow, onDragEnd };
}
```

- [ ] **Step 4: Run the hook test to confirm pass**

Run: `npx vitest run src/components/schedule/__tests__/useTaskRowDnD.test.js`
Expected: PASS.

- [ ] **Step 5: Wire the hook into ScheduleGantt's left-panel rows**

In `src/components/schedule/ScheduleGantt.jsx`:

1. Import the hook and instantiate it near the top of the component (the component receives `onSave`; add a sibling `onReparent` prop fed from Schedule.tsx — see Step 7):

```javascript
import { useTaskRowDnD } from "./useTaskRowDnD";
// …inside the component:
const scrollRef = useRef(null); // attach to the left-panel scroll container if not already present
const { dragId, dropTarget, onDragStart, onDragOverRow, onDropRow, onDragEnd } = useTaskRowDnD({
  tasks: rows,                 // the flat displayed rows already computed for render
  onReparent: (p) => onReparent?.(p),
  getScrollEl: () => scrollRef.current,
});
```

2. On each left-panel task ROW element (the row container rendered around line 1429–1543), add:

```jsx
  draggable
  onDragStart={(e) => onDragStart(e, task)}
  onDragOver={(e) => onDragOverRow(e, task)}
  onDrop={(e) => onDropRow(e, task)}
  onDragEnd={onDragEnd}
  style={{
    ...existingRowStyle,
    opacity: dragId === task.id ? 0.4 : 1,
    boxShadow: dropTarget?.id === task.id && dropTarget.zone === "nest"
      ? "inset 0 0 0 2px var(--accent)" : undefined,
    borderTop: dropTarget?.id === task.id && dropTarget.zone === "before"
      ? "2px solid var(--accent)" : undefined,
    borderBottom: dropTarget?.id === task.id && dropTarget.zone === "after"
      ? "2px solid var(--accent)" : undefined,
  }}
```

> Keep the timeline bar elements NON-draggable (do not add `draggable` to anything under the bar/`useTaskBarDrag` area) so date-drag is unaffected.

- [ ] **Step 6: REMOVE the superseded controls**

Delete from `ScheduleGantt.jsx` (verify exact lines before deleting):
- `handleMoveUp`, `handleMoveDown`, `swapOrder` (~277–328).
- `computeIndentTarget`, `computeOutdentTarget`, `handleIndent`, `handleOutdent`, `canIndent`, `canOutdent` (~239–355).
- The Tab / Shift+Tab / Alt+↑ / Alt+↓ key handling block (~357–400).
- The hover ▲ ▼ ◂ ▸ buttons in the row render (~1471–1543).

After deletion, grep to confirm nothing else references the removed names:

```bash
grep -nE "handleIndent|handleOutdent|computeIndentTarget|swapOrder|handleMoveUp|handleMoveDown|canIndent|canOutdent" src/components/schedule/ScheduleGantt.jsx
```
Expected: no matches.

- [ ] **Step 7: Pass `onReparent` from Schedule.tsx to ScheduleGantt**

In `src/pages/Schedule.tsx`, on the `<ScheduleGantt … />` (line 858), add:

```tsx
                onReparent={(p: { ids: string[]; newParentId: string | null; dropIndex?: number | null }) =>
                  reparentMut.mutate(p)
                }
```

- [ ] **Step 8: Full suite + build**

Run: `npm test 2>&1 | tail -40` then `node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20`
Expected: tests PASS (note any pre-existing unrelated failures); build EXIT 0.

- [ ] **Step 9: Commit**

```bash
git add src/components/schedule/useTaskRowDnD.js src/components/schedule/__tests__/useTaskRowDnD.test.js src/components/schedule/ScheduleGantt.jsx src/pages/Schedule.tsx
git commit -m "feat(schedule): drag-to-reparent Gantt rows; remove indent/reorder buttons"
```

---

## Task 7: Retire GanttChart.tsx

**Files:**
- Delete: `src/pages/GanttChart.tsx`
- Modify: `src/config/routes.js` (remove the `GanttChart` registry entry; add a redirect)
- Modify: `src/config/moduleRegistry.js` (remove any nav item pointing at `GanttChart`)
- Modify: `src/pages/GanttChart.tsx` consumers, if any

- [ ] **Step 1: Confirm no other code imports GanttChart**

```bash
grep -rnE "pages/GanttChart|\"GanttChart\"|'GanttChart'" src
```
Expected: only `src/config/routes.js:102` and possibly `src/config/moduleRegistry.js`. If any component imports the page directly, stop and reassess.

- [ ] **Step 2: Remove the registry entry and redirect the path**

In `src/config/routes.js`, delete the `GanttChart:` line (102). To keep old `/GanttChart` deep links working, the app router (`src/boot/AppRoutes.jsx`) should map `/GanttChart` → `/Schedule`. Inspect `AppRoutes.jsx` for how `ALL_ROUTE_PATHS` mounts; add a redirect route:

```jsx
<Route path="/GanttChart" element={<Navigate to="/Schedule" replace />} />
```
(Place it before the generic registry-driven routes; import `Navigate` from `react-router-dom` if not already imported.)

- [ ] **Step 3: Remove the nav item**

In `src/config/moduleRegistry.js`, find and remove any `{ page: "GanttChart", … }` nav entry. Per memory: moduleRegistry icons are literal `\uXXXX` — edit narrowly, do not reformat surrounding lines.

- [ ] **Step 4: Delete the page**

```bash
git rm src/pages/GanttChart.tsx
```

- [ ] **Step 5: Verify route validation + build**

The `validateRoutes()` block runs in dev and a CI test asserts no drift. Run:

```bash
npx vitest run src/config 2>&1 | tail -30
node ./node_modules/vite/bin/vite.js build 2>&1 | tail -20
```
Expected: no "Navigation references unregistered page: GanttChart"; build EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add src/config/routes.js src/config/moduleRegistry.js src/boot/AppRoutes.jsx
git commit -m "chore(schedule): retire GanttChart page; redirect /GanttChart to /Schedule"
```

---

## Task 8: Validation ladder + field verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full pre-deploy ladder**

```powershell
npm run lint 2>&1 | Select-Object -Last 30; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck 2>&1 | Select-Object -Last 30; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck:strict 2>&1 | Select-Object -Last 30; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck:noimplicitany 2>&1 | Select-Object -Last 30; Write-Host "EXIT: $LASTEXITCODE"
npm test 2>&1 | Select-Object -Last 50; Write-Host "EXIT: $LASTEXITCODE"
node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 20; Write-Host "EXIT: $LASTEXITCODE"
```
Expected: all EXIT 0. `typecheck:strict`/`noimplicitany` must not regress — do NOT add files to the ignore lists.

- [ ] **Step 2: Field-verify in the running app (REQUIRED before "done")**

`npm run dev`, open a project's Schedule → Gantt tab, and confirm each:
- [ ] Drag a task **onto** another row → it nests as a child (row indents, summary parent rolls up dates).
- [ ] Drag a task into the **gap** between two rows → it reorders as a sibling (insert line shown).
- [ ] Drag near the top/bottom edge → the list auto-scrolls so an off-screen parent is reachable.
- [ ] Dragging onto a descendant shows a no-drop cursor and does nothing.
- [ ] Open a task's detail drawer → set/clear its **Parent task** → tree updates.
- [ ] Multi-select tasks → **Set Parent** → all nest under the chosen parent.
- [ ] Old `/GanttChart` URL redirects to `/Schedule`; no "Gantt Chart" nav item remains.
- [ ] Timeline **bar date-drag still works** (regression check — DnD did not break it).
- [ ] In Supabase, confirm a hand-made cycle attempt is rejected by the trigger (Task 2 Step 3).

- [ ] **Step 3: Report**

Summarize using the CLAUDE.md final-response format (Changed / Tested / Notes-risks / Commit-deploy). Label verification level honestly: unit/build vs field. Do NOT push to `main` unless the user asks to ship.

---

## Self-review notes (author)

- **Spec coverage:** shared core (T1) ✓; DB trigger (T2) ✓; audited writer + sequencing (T3) ✓; drag primary w/ nest+gap+auto-scroll (T6) ✓; drawer picker (T4) ✓; bulk set-parent (T5) ✓; retire GanttChart + redirect (T7) ✓; a11y note carried in spec; out-of-scope items untouched ✓.
- **Type/name consistency:** `reparentTasks(taskIds, newParentId, { tasks, dropIndex, projectId, projectName })`, `wouldCreateCycle(tasks, childId, newParentId)`, `validReparentTargets(tasks, childId)`, `computeSiblingSortOrder(tasks, newParentId, dropIndex)`, `dropZoneFor(rect, clientY)`, hook `useTaskRowDnD({ tasks, onReparent, getScrollEl })` returning `{ onDragStart, onDragOverRow, onDropRow, onDragEnd, dragId, dropTarget }` — used consistently across T3/T4/T5/T6.
- **Known integration risk:** the exact line anchors in `ScheduleGantt.jsx` (a ~2280-line file) and `Schedule.tsx` will drift; the implementer must locate the row-render block and removed handlers by name (grep commands provided) rather than trusting line numbers. `AppRoutes.jsx` redirect mechanics must be confirmed against the actual router before editing.
