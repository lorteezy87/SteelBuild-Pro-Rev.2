/**
 * Shared Supabase query mock for entity client suites.
 * Extracts the hoisted calls / makeChain / reset pattern so functions,
 * auth, and entity tests do not duplicate it.
 */
import { expect, vi } from "vitest";

export type QueryOp =
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

export type QueryCall =
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

/** Minimal PostgREST-like chain so new operators surface at compile time. */
export interface MockChain {
  select: (value?: string) => MockChain;
  eq: (column: string, value: unknown) => MockChain;
  in: (column: string, value: unknown[]) => MockChain;
  order: (column: string, opts?: unknown) => MockChain;
  limit: (n: number) => MockChain;
  range: (from: number, to: number) => MockChain;
  update: (value: Record<string, unknown>) => MockChain;
  delete: () => MockChain;
  insert: (value: unknown) => MockChain;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (
    onfulfilled?: (value: { data: unknown; error: unknown }) => unknown,
    onrejected?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

/** Loose ISO-8601 matcher (catches invalid date strings early). */
export const expectIsoTimestamp = expect.stringMatching(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/,
);

export type CreateMockOptions = {
  defaultListResult?: { data: unknown; error: unknown };
  defaultRpcResult?: { data: unknown; error: unknown };
};

export function createSupabaseQueryMock(options: CreateMockOptions = {}) {
  const calls: QueryCall[] = [];
  let listResult = options.defaultListResult ?? { data: [] as unknown[], error: null };
  let rpcResult = options.defaultRpcResult ?? { data: {}, error: null };
  let listError: unknown = null;

  const makeChain = (table: string): MockChain => {
    const chain: MockChain = {
      select: (value = "*") => {
        calls.push({ table, op: "select", value });
        return chain;
      },
      eq: (column, value) => {
        calls.push({ table, op: "eq", column, value });
        return chain;
      },
      in: (column, value) => {
        calls.push({ table, op: "in", column, value });
        return chain;
      },
      order: (column, value) => {
        calls.push({ table, op: "order", column, value });
        return chain;
      },
      limit: (n) => {
        calls.push({ table, op: "limit", value: n });
        return chain;
      },
      range: (from, to) => {
        calls.push({ table, op: "range", from, to });
        return chain;
      },
      update: (value) => {
        calls.push({ table, op: "update", value });
        return chain;
      },
      delete: () => {
        calls.push({ table, op: "delete" });
        return chain;
      },
      insert: (value) => {
        calls.push({ table, op: "insert", value });
        return chain;
      },
      single: () =>
        Promise.resolve(
          listError
            ? { data: null, error: listError }
            : { data: (listResult as { data: unknown[] }).data?.[0] ?? {}, error: null },
        ),
      maybeSingle: () =>
        Promise.resolve(
          listError
            ? { data: null, error: listError }
            : { data: (listResult as { data: unknown[] }).data?.[0] ?? null, error: null },
        ),
      then: (onfulfilled, onrejected) => {
        const result = listError
          ? { data: null, error: listError }
          : listResult;
        return Promise.resolve(result).then(onfulfilled, onrejected);
      },
    };
    return chain;
  };

  const fromMock = vi.fn((table: string) => makeChain(table));
  const rpcMock = vi.fn(() => Promise.resolve(rpcResult));

  const reset = () => {
    calls.length = 0;
    listResult = options.defaultListResult ?? { data: [], error: null };
    rpcResult = options.defaultRpcResult ?? { data: {}, error: null };
    listError = null;
    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => makeChain(table));
    rpcMock.mockReset();
    rpcMock.mockImplementation(() => Promise.resolve(rpcResult));
  };

  /** Configure the next list/then result (success path). */
  const mockListResult = (result: { data: unknown; error: unknown }) => {
    listResult = result;
    listError = null;
  };

  /** Force an error on the next list/then (failure path). */
  const mockListError = (error: unknown) => {
    listError = error;
  };

  /** Configure RPC result or error. */
  const mockRpcResult = (result: { data: unknown; error: unknown }) => {
    rpcResult = result;
    rpcMock.mockImplementation(() => Promise.resolve(rpcResult));
  };

  const mockRpcError = (error: unknown) => {
    rpcResult = { data: null, error };
    rpcMock.mockImplementation(() => Promise.resolve(rpcResult));
  };

  // ── Assertion helpers ─────────────────────────────────────────────────────

  /** Assert soft-delete contract: update(is_deleted+deleted_at) then eq/in on id. */
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

    // Never a hard delete on soft-delete tables
    expect(calls.some((c) => c.table === table && c.op === "delete")).toBe(false);
  };

  /** Assert project-scoped list select + live-project + soft-delete filters. */
  const expectProjectScopedSelect = (
    table: string,
    fkEmbed?: string,
  ) => {
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

    // Soft-delete filter when applicable (most project-scoped tables are soft-deletable)
    expect(calls).toContainEqual({
      table,
      op: "eq",
      column: "is_deleted",
      value: false,
    });
  };

  /**
   * Assert that the recorded ops for a table appear in the given order
   * (e.g. ["update", "eq"] or ["update", "in"]).
   */
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
    makeChain,
    reset,
    mockListResult,
    mockListError,
    mockRpcResult,
    mockRpcError,
    expectSoftDelete,
    expectProjectScopedSelect,
    expectCallOrder,
    expectIsoTimestamp,
  };
}
