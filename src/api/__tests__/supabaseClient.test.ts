import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSupabaseQueryMock,
  expectIsoTimestamp,
} from "./helpers/supabaseQueryMock";

const mocks = vi.hoisted(() => createSupabaseQueryMock());

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import { entities } from "@/api/supabaseClient";

// Tables that receive live-project scoping + soft-delete on list()
const PROJECT_SCOPED_ENTITIES = [
  {
    name: "WorkPackage" as const,
    table: "work_packages",
    fk: "work_packages_project_id_fkey",
  },
  {
    name: "CostCode" as const,
    table: "cost_codes",
    fk: "cost_codes_project_id_fkey",
  },
  {
    name: "Contact" as const,
    table: "contacts",
    fk: "contacts_project_id_fkey",
  },
  {
    name: "SOVItem" as const,
    table: "sov_items",
    fk: "sov_items_project_id_fkey",
  },
  {
    name: "ChangeOrder" as const,
    table: "change_orders",
    fk: "change_orders_project_id_fkey",
  },
] as const;

describe("supabase entity client", () => {
  beforeEach(() => {
    mocks.reset(); // mockReset + explicit defaults — avoids leakage
  });

  describe("project-scoped list reads", () => {
    it.each(PROJECT_SCOPED_ENTITIES)(
      "$name.list scopes to non-archived projects and soft-deletes",
      async ({ name, table, fk }) => {
        await entities[name].list();

        mocks.expectProjectScopedSelect(
          table,
          `*, projects!${fk}!inner(id)`,
        );

        // Pagination defaults applied by production client
        expect(mocks.calls).toContainEqual({
          table,
          op: "order",
          column: "created_at",
          value: { ascending: false },
        });
        expect(mocks.calls).toContainEqual({
          table,
          op: "limit",
          value: 2000,
        });
      },
    );

    it("does not add parent-project joins to project root reads", async () => {
      await entities.Project.list();

      expect(mocks.calls).toContainEqual({
        table: "projects",
        op: "select",
        value: "*",
      });
      expect(mocks.calls).not.toContainEqual({
        table: "projects",
        op: "eq",
        column: "projects.is_deleted",
        value: false,
      });
      // projects still soft-delete filter themselves + on_hold
      expect(mocks.calls).toContainEqual({
        table: "projects",
        op: "eq",
        column: "is_deleted",
        value: false,
      });
      expect(mocks.calls).toContainEqual({
        table: "projects",
        op: "eq",
        column: "on_hold",
        value: false,
      });
    });
  });

  describe("soft-delete", () => {
    it("uses the cost-code table's soft-delete contract", async () => {
      await entities.CostCode.delete("cost-code-1");

      mocks.expectSoftDelete("cost_codes", "cost-code-1");
      mocks.expectCallOrder("cost_codes", ["update", "eq"]);
    });

    it("soft-deletes change orders so they disappear from active project reads", async () => {
      await entities.ChangeOrder.delete("change-order-1");

      mocks.expectSoftDelete("change_orders", "change-order-1");
      mocks.expectCallOrder("change_orders", ["update", "eq"]);
    });

    it("archives a project atomically via the soft_delete_project RPC", async () => {
      await entities.Project.delete("project-1");

      expect(mocks.rpcMock).toHaveBeenCalledWith("soft_delete_project", {
        p_project_id: "project-1",
      });
      expect(mocks.calls).not.toContainEqual(
        expect.objectContaining({ table: "work_packages", op: "update" }),
      );
      expect(mocks.calls).not.toContainEqual(
        expect.objectContaining({ table: "projects", op: "update" }),
      );
    });
  });

  describe("bulkUpdate", () => {
    it("applies one patch via a single .in('id', ids) UPDATE", async () => {
      await entities.SOVItem.bulkUpdate(["a", "b", "c"], { status: "Certified" });

      const updates = mocks.calls.filter(
        (c): c is Extract<(typeof mocks.calls)[number], { op: "update" }> =>
          c.table === "sov_items" && c.op === "update",
      );
      expect(updates).toHaveLength(1);
      expect(updates[0].value).toMatchObject({ status: "Certified" });
      expect(updates[0].value.updated_at).toEqual(expectIsoTimestamp);

      const ins = mocks.calls.filter(
        (c): c is Extract<(typeof mocks.calls)[number], { op: "in" }> =>
          c.table === "sov_items" && c.op === "in",
      );
      expect(ins).toHaveLength(1);
      expect(ins[0]).toEqual({
        table: "sov_items",
        op: "in",
        column: "id",
        value: ["a", "b", "c"],
      });

      // Sequence: update then in
      mocks.expectCallOrder("sov_items", ["update", "in"]);
    });

    it("chunks large id lists into ≤500-id .in filters sequentially", async () => {
      const ids = Array.from({ length: 1050 }, (_, i) => `id-${i}`);
      await entities.SOVItem.bulkUpdate(ids, { status: "Paid" });

      const ins = mocks.calls.filter(
        (c): c is Extract<(typeof mocks.calls)[number], { op: "in" }> =>
          c.table === "sov_items" && c.op === "in",
      );
      expect(ins.map((c) => c.value.length)).toEqual([500, 500, 50]);

      const updates = mocks.calls.filter(
        (c) => c.table === "sov_items" && c.op === "update",
      );
      expect(updates).toHaveLength(3);

      // Sequential: three update→in pairs in order (no parallel interleaving)
      const sovOps = mocks.calls
        .filter((c) => c.table === "sov_items")
        .map((c) => c.op);
      expect(sovOps).toEqual([
        "update",
        "in",
        "update",
        "in",
        "update",
        "in",
      ]);
    });

    it("makes no request for an empty id list", async () => {
      const result = await entities.SOVItem.bulkUpdate([], { status: "Draft" });
      expect(result).toEqual([]);
      expect(mocks.fromMock).not.toHaveBeenCalled();
    });
  });
});
