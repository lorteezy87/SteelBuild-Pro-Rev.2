import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryOp =
  | "select"
  | "eq"
  | "in"
  | "order"
  | "limit"
  | "range"
  | "update"
  | "delete"
  | "insert"
  | "single"
  | "maybeSingle";

type QueryCall =
  | { table: string; op: "select"; value: string }
  | { table: string; op: "eq"; column: string; value: unknown }
  | { table: string; op: "in"; column: string; value: unknown[] }
  | { table: string; op: "order"; column: string; value: unknown }
  | { table: string; op: "limit"; value: number }
  | { table: string; op: "range"; from: number; to: number }
  | { table: string; op: "update"; value: Record<string, unknown> }
  | { table: string; op: "delete" }
  | { table: string; op: "insert"; value: unknown }
  | { table: string; op: "single" }
  | { table: string; op: "maybeSingle" };

const expectIsoTimestamp = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
);

// Full factory lives inside vi.hoisted so there is no ESM TDZ / require(.ts) issue.
const mocks = vi.hoisted(() => {
  const calls: QueryCall[] = [];
  let listResult: { data: unknown; error: unknown } = { data: [], error: null };
  let rpcResult: { data: unknown; error: unknown } = { data: {}, error: null };
  let listError: unknown = null;

  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = chain as {
      select: (value?: string) => typeof chain;
      eq: (column: string, value: unknown) => typeof chain;
      in: (column: string, value: unknown[]) => typeof chain;
      order: (column: string, value?: unknown) => typeof chain;
      limit: (n: number) => typeof chain;
      range: (from: number, to: number) => typeof chain;
      update: (value: Record<string, unknown>) => typeof chain;
      delete: () => typeof chain;
      insert: (value: unknown) => typeof chain;
      single: () => Promise<{ data: unknown; error: unknown }>;
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      then: (
        onfulfilled?: (value: { data: unknown; error: unknown }) => unknown,
        onrejected?: (reason: unknown) => unknown,
      ) => Promise<unknown>;
    };

    self.select = (value = "*") => {
      calls.push({ table, op: "select", value });
      return chain;
    };
    self.eq = (column, value) => {
      calls.push({ table, op: "eq", column, value });
      return chain;
    };
    self.in = (column, value) => {
      calls.push({ table, op: "in", column, value });
      return chain;
    };
    self.order = (column, value) => {
      calls.push({ table, op: "order", column, value });
      return chain;
    };
    self.limit = (n) => {
      calls.push({ table, op: "limit", value: n });
      return chain;
    };
    self.range = (from, to) => {
      calls.push({ table, op: "range", from, to });
      return chain;
    };
    self.update = (value) => {
      calls.push({ table, op: "update", value });
      return chain;
    };
    self.delete = () => {
      calls.push({ table, op: "delete" });
      return chain;
    };
    self.insert = (value) => {
      calls.push({ table, op: "insert", value });
      return chain;
    };
    self.single = () =>
      Promise.resolve(
        listError
          ? { data: null, error: listError }
          : {
              data: (listResult as { data: unknown[] }).data?.[0] ?? {},
              error: null,
            },
      );
    self.maybeSingle = () =>
      Promise.resolve(
        listError
          ? { data: null, error: listError }
          : {
              data: (listResult as { data: unknown[] }).data?.[0] ?? null,
              error: null,
            },
      );
    self.then = (onfulfilled, onrejected) => {
      const result = listError ? { data: null, error: listError } : listResult;
      return Promise.resolve(result).then(onfulfilled, onrejected);
    };

    return self;
  };

  const fromMock = vi.fn((table: string) => makeChain(table));
  const rpcMock = vi.fn(() => Promise.resolve(rpcResult));

  const reset = () => {
    calls.length = 0;
    listResult = { data: [], error: null };
    rpcResult = { data: {}, error: null };
    listError = null;
    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => makeChain(table));
    rpcMock.mockReset();
    rpcMock.mockImplementation(() => Promise.resolve(rpcResult));
  };

  const expectSoftDelete = (table: string, id: string | string[]) => {
    const updateIdx = calls.findIndex(
      (c) => c.table === table && c.op === "update",
    );
    expect(updateIdx).toBeGreaterThanOrEqual(0);
    const updateCall = calls[updateIdx] as Extract<QueryCall, { op: "update" }>;
    expect(updateCall.value).toMatchObject({
      is_deleted: true,
      deleted_at: expectIsoTimestamp,
    });

    const filterCall = calls.slice(updateIdx + 1).find(
      (c) =>
        c.table === table &&
        ((c.op === "eq" && c.column === "id") ||
          (c.op === "in" && c.column === "id")),
    );
    expect(filterCall).toBeDefined();
    if (filterCall?.op === "eq") {
      expect(filterCall.value).toBe(id);
    } else if (filterCall?.op === "in") {
      expect(filterCall.value).toEqual(Array.isArray(id) ? id : [id]);
    }

    expect(calls.some((c) => c.table === table && c.op === "delete")).toBe(
      false,
    );
  };

  const expectProjectScopedSelect = (table: string, fkEmbed?: string) => {
    const embed =
      fkEmbed ??
      (table === "projects"
        ? "*"
        : `*, projects!${table}_project_id_fkey!inner(id)`);

    expect(calls).toContainEqual({
      table,
      op: "select",
      value: embed,
    });

    if (table !== "projects") {
      expect(calls).toContainEqual({
        table,
        op: "eq",
        column: "projects.is_deleted",
        value: false,
      });
    }

    expect(calls).toContainEqual({
      table,
      op: "eq",
      column: "is_deleted",
      value: false,
    });
  };

  const expectCallOrder = (table: string, ops: QueryOp[]) => {
    const tableCalls = calls.filter((c) => c.table === table);
    const observed = tableCalls.map((c) => c.op);
    let idx = 0;
    for (const wanted of ops) {
      const found = observed.indexOf(wanted, idx);
      expect(found).toBeGreaterThanOrEqual(0);
      idx = found + 1;
    }
  };

  return {
    calls,
    fromMock,
    rpcMock,
    reset,
    expectSoftDelete,
    expectProjectScopedSelect,
    expectCallOrder,
  };
});

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
    mocks.reset();
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
      // A real UUID, not "project-1": Project.delete now validates the id
      // against softDeleteProjectArgsSchema before calling the RPC, so a
      // placeholder is rejected by zod before the call is ever made.
      const projectId = "3793bea9-5c67-4ba4-adee-ac98022ee2fc";
      await entities.Project.delete(projectId);

      expect(mocks.rpcMock).toHaveBeenCalledWith("soft_delete_project", {
        p_project_id: projectId,
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
    // Ordinary entities share the chunked update contract. SOV lines use
    // reviewed saves and deliberately reject non-empty bulk updates.
    it("applies one patch via a single .in('id', ids) UPDATE", async () => {
      await entities.CostCode.bulkUpdate(["a", "b", "c"], { description: "Field erection" });

      const updates = mocks.calls.filter(
        (c): c is Extract<(typeof mocks.calls)[number], { op: "update" }> =>
          c.table === "cost_codes" && c.op === "update",
      );
      expect(updates).toHaveLength(1);
      expect(updates[0].value).toMatchObject({ description: "Field erection" });
      expect(updates[0].value.updated_at).toEqual(expectIsoTimestamp);

      const ins = mocks.calls.filter(
        (c): c is Extract<(typeof mocks.calls)[number], { op: "in" }> =>
          c.table === "cost_codes" && c.op === "in",
      );
      expect(ins).toHaveLength(1);
      expect(ins[0]).toEqual({
        table: "cost_codes",
        op: "in",
        column: "id",
        value: ["a", "b", "c"],
      });

      // Production: .update().in().select()
      mocks.expectCallOrder("cost_codes", ["update", "in", "select"]);
    });

    it("chunks large id lists into ≤500-id .in filters sequentially", async () => {
      const ids = Array.from({ length: 1050 }, (_, i) => `id-${i}`);
      await entities.CostCode.bulkUpdate(ids, { description: "Shop fabrication" });

      const ins = mocks.calls.filter(
        (c): c is Extract<(typeof mocks.calls)[number], { op: "in" }> =>
          c.table === "cost_codes" && c.op === "in",
      );
      expect(ins.map((c) => c.value.length)).toEqual([500, 500, 50]);

      const updates = mocks.calls.filter(
        (c) => c.table === "cost_codes" && c.op === "update",
      );
      expect(updates).toHaveLength(3);

      // Sequential for-await: update → in → select per chunk
      const costCodeOps = mocks.calls
        .filter((c) => c.table === "cost_codes")
        .map((c) => c.op);
      expect(costCodeOps).toEqual([
        "update",
        "in",
        "select",
        "update",
        "in",
        "select",
        "update",
        "in",
        "select",
      ]);
    });

    it("makes no request for an empty id list", async () => {
      const result = await entities.CostCode.bulkUpdate([], { description: "Field erection" });
      expect(result).toEqual([]);
      expect(mocks.fromMock).not.toHaveBeenCalled();
      expect(mocks.rpcMock).not.toHaveBeenCalled();
    });
  });
});
