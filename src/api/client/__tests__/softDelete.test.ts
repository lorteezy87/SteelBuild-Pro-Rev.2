import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * schedule_tasks is soft-delete only.
 *
 * The database gained is_deleted / deleted_at plus a BEFORE DELETE guard
 * (trg_enforce_schedule_task_guards) that raises 42501 on any hard delete, and
 * `authenticated` holds no DELETE grant. The client registry was not updated to
 * match, so entityClient.delete() took the hard-delete branch and every attempt
 * failed with:
 *
 *   [schedule_tasks.delete] permission denied for table schedule_tasks
 *
 * These tests pin both halves of the fix: the write is an is_deleted UPDATE, and
 * reads exclude tombstoned rows so a deleted task stops feeding the Gantt, the
 * cascade, float and percent-complete.
 */

const updateSpy = vi.fn();
const deleteSpy = vi.fn();
const eqSpy = vi.fn();

function makeBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.order = vi.fn(chain);
  builder.limit = vi.fn(chain);
  builder.single = vi.fn(async () => ({ data: null, error: null }));
  builder.eq = vi.fn((col: string, val: unknown) => {
    eqSpy(col, val);
    return builder;
  });
  builder.update = vi.fn((patch: unknown) => {
    updateSpy(patch);
    return builder;
  });
  builder.delete = vi.fn(() => {
    deleteSpy();
    return builder;
  });
  // Terminal await on the builder resolves like a PostgREST response.
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return builder;
}

const fromSpy = vi.fn(() => makeBuilder());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromSpy(...(args as [])),
    rpc: vi.fn(),
  },
}));

import { entities } from "@/api/client/entities";
import { SOFT_DELETE_TABLES, PROJECT_SCOPED_TABLES } from "@/api/client/softDelete";

describe("schedule_tasks soft-delete registration", () => {
  beforeEach(() => {
    updateSpy.mockClear();
    deleteSpy.mockClear();
    eqSpy.mockClear();
    fromSpy.mockClear();
  });

  it("is registered as a soft-delete table", () => {
    // Removing this entry silently reintroduces the permission-denied bug.
    expect(SOFT_DELETE_TABLES.has("schedule_tasks")).toBe(true);
  });

  it("is still project-scoped, so an archived project's tasks stay hidden", () => {
    expect(PROJECT_SCOPED_TABLES.has("schedule_tasks")).toBe(true);
  });

  it("delete() writes is_deleted instead of issuing a hard DELETE", async () => {
    await entities.ScheduleTask.delete("task-1");

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const patch = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch.is_deleted).toBe(true);
    expect(typeof patch.deleted_at).toBe("string");
    expect(eqSpy).toHaveBeenCalledWith("id", "task-1");
  });

  it("reads exclude tombstoned tasks", async () => {
    await entities.ScheduleTask.list();
    expect(eqSpy).toHaveBeenCalledWith("is_deleted", false);
  });

  it("filter() also excludes tombstoned tasks", async () => {
    await entities.ScheduleTask.filter({ project_id: "project-1" });
    expect(eqSpy).toHaveBeenCalledWith("is_deleted", false);
  });

  it("every soft-delete table name is lowercase snake_case", () => {
    // A typo'd entry is a silent no-op — the table keeps hard-deleting.
    for (const name of SOFT_DELETE_TABLES) {
      expect(name, `${name} is not a plausible table name`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("tables whose database forbids hard deletes", () => {
  // Each has no DELETE grant for `authenticated` and a guard trigger that
  // raises on DELETE. A hard-delete branch can only ever fail for them.
  const FORBID_HARD_DELETE = [
    "action_items", "change_requests", "mitigation_actions", "mitigation_logs",
    "project_closeout", "project_handoff_items", "vendors", "warranties",
  ] as const;

  beforeEach(() => {
    updateSpy.mockClear();
    deleteSpy.mockClear();
    eqSpy.mockClear();
  });

  it.each(FORBID_HARD_DELETE)("%s is registered for soft delete", (table) => {
    expect(SOFT_DELETE_TABLES.has(table)).toBe(true);
  });

  it.each([
    ["Vendor", "vendors"],
    ["Warranty", "warranties"],
    ["ChangeRequest", "change_requests"],
    ["ActionItem", "action_items"],
  ] as const)("%s.delete() archives instead of deleting", async (entity, _table) => {
    await (entities[entity] as { delete: (id: string) => Promise<unknown> }).delete("row-1");
    expect(deleteSpy).not.toHaveBeenCalled();
    expect((updateSpy.mock.calls[0]?.[0] as Record<string, unknown>).is_deleted).toBe(true);
  });

  it("Vendor.list() excludes archived vendors", async () => {
    await entities.Vendor.list();
    expect(eqSpy).toHaveBeenCalledWith("is_deleted", false);
  });

  it("vendors is org-scoped, so it is never embedded through a project FK", () => {
    // projectScopedSelect would request projects!vendors_project_id_fkey, a
    // relationship that does not exist, and PostgREST would reject every read.
    expect(PROJECT_SCOPED_TABLES.has("vendors")).toBe(false);
  });

  it("every project-scoped table has the project FK its embed names", () => {
    const types = readFileSync(resolve(__dirname, "../../../types/supabase.ts"), "utf8");
    const missing = [...PROJECT_SCOPED_TABLES].filter((t) => !types.includes(`foreignKeyName: "${t}_project_id_fkey"`));
    expect(missing).toEqual([]);
  });

  it("drawing_transmittals stays out: last-transmittal evidence must see archived headers", () => {
    expect(SOFT_DELETE_TABLES.has("drawing_transmittals")).toBe(false);
  });
});

