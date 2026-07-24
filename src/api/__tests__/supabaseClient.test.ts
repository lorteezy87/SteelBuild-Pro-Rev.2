import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryCall =
  | { table: string; op: "select"; value: string }
  | { table: string; op: "eq"; column: string; value: unknown }
  | { table: string; op: "in"; column: string; value: unknown[] }
  | { table: string; op: "order"; column: string; value: unknown }
  | { table: string; op: "update"; value: Record<string, unknown> };

const mocks = vi.hoisted(() => {
  const calls: QueryCall[] = [];

  const makeChain = (table: string) => {
    const chain: Record<string, unknown> = {
      select: vi.fn((value: string) => {
        calls.push({ table, op: "select", value });
        return chain;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        calls.push({ table, op: "eq", column, value });
        return chain;
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        calls.push({ table, op: "in", column, value });
        return chain;
      }),
      order: vi.fn((column: string, value: unknown) => {
        calls.push({ table, op: "order", column, value });
        return chain;
      }),
      limit: vi.fn((_n: number) => chain),
      update: vi.fn((value: Record<string, unknown>) => {
        calls.push({ table, op: "update", value });
        return chain;
      }),
      single: vi.fn().mockResolvedValue({ data: {}, error: null }),
      then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
        resolve({ data: [], error: null }),
    };
    return chain;
  };

  return {
    calls,
    fromMock: vi.fn((table: string) => makeChain(table)),
    rpcMock: vi.fn().mockResolvedValue({ data: {}, error: null }),
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

describe("supabase entity client", () => {
  beforeEach(() => {
    mocks.calls.length = 0;
    mocks.fromMock.mockClear();
    mocks.rpcMock.mockClear();
  });

  it("scopes project child list reads to non-archived projects", async () => {
    await entities.WorkPackage.list();

    expect(mocks.calls).toContainEqual({
      table: "work_packages",
      op: "select",
      value: "*, projects!work_packages_project_id_fkey!inner(id)",
    });
    expect(mocks.calls).toContainEqual({
      table: "work_packages",
      op: "eq",
      column: "projects.is_deleted",
      value: false,
    });
    expect(mocks.calls).toContainEqual({
      table: "work_packages",
      op: "eq",
      column: "is_deleted",
      value: false,
    });
  });

  it("disambiguates contacts→projects via the project_id FK (not detailer_contact_id)", async () => {
    // projects.detailer_contact_id → contacts creates a second PostgREST path;
    // bare projects!inner fails with "more than one relationship" (Sentry
    // JAVASCRIPT-REACT-10). The embed must name contacts_project_id_fkey.
    await entities.Contact.list();

    expect(mocks.calls).toContainEqual({
      table: "contacts",
      op: "select",
      value: "*, projects!contacts_project_id_fkey!inner(id)",
    });
  });

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
  });

  it("archives a project atomically via the soft_delete_project RPC", async () => {
    await entities.Project.delete("project-1");

    // The whole cascade (children + root) runs server-side in one transaction;
    // the client must NOT issue piecemeal per-table updates (#13).
    expect(mocks.rpcMock).toHaveBeenCalledWith("soft_delete_project", {
      p_project_id: "project-1",
    });
    expect(mocks.calls).not.toContainEqual(
      expect.objectContaining({ table: "work_packages", op: "update" })
    );
    expect(mocks.calls).not.toContainEqual(
      expect.objectContaining({ table: "projects", op: "update" })
    );
  });

  it("bulkUpdate applies one patch via a single .in('id', ids) UPDATE", async () => {
    await entities.SOVItem.bulkUpdate(["a", "b", "c"], { status: "Certified" });

    // Exactly one UPDATE, carrying the patch + a server updated_at stamp.
    const updates = mocks.calls.filter(
      (c): c is Extract<QueryCall, { op: "update" }> =>
        c.table === "sov_items" && c.op === "update"
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].value).toMatchObject({ status: "Certified" });
    expect(updates[0].value.updated_at).toEqual(expect.any(String));

    // Rows targeted by a single chunked .in('id', [...]) filter, not per-row .eq.
    const ins = mocks.calls.filter(
      (c): c is Extract<QueryCall, { op: "in" }> =>
        c.table === "sov_items" && c.op === "in"
    );
    expect(ins).toHaveLength(1);
    expect(ins[0]).toEqual({ table: "sov_items", op: "in", column: "id", value: ["a", "b", "c"] });
  });

  it("bulkUpdate chunks large id lists into ≤500-id .in filters", async () => {
    const ids = Array.from({ length: 1050 }, (_, i) => `id-${i}`);
    await entities.SOVItem.bulkUpdate(ids, { status: "Paid" });

    const ins = mocks.calls.filter(
      (c): c is Extract<QueryCall, { op: "in" }> =>
        c.table === "sov_items" && c.op === "in"
    );
    // 1050 ids → 500 + 500 + 50 = three chunks / three UPDATEs.
    expect(ins.map((c) => c.value.length)).toEqual([500, 500, 50]);
    const updates = mocks.calls.filter(
      (c) => c.table === "sov_items" && c.op === "update"
    );
    expect(updates).toHaveLength(3);
  });

  it("bulkUpdate makes no request for an empty id list", async () => {
    const result = await entities.SOVItem.bulkUpdate([], { status: "Draft" });
    expect(result).toEqual([]);
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });
});
