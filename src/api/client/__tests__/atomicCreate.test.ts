import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guarded tables: creation must go through the atomic RPC.
 *
 * change_orders, change_requests, deliveries and backcharges each mint an
 * official record number inside the inserting transaction, and a BEFORE INSERT
 * trigger rejects any direct write:
 *
 *   Use create_change_order() — CO numbers are minted there
 *   Use create_change_request() — CR numbers are minted there
 *   Deliveries are created through create_delivery(); numbers are minted there
 *   Use create_backcharge() — numbers are minted there
 *
 * The guards test a transaction-local `steelbuild.*_rpc` GUC that only the RPC
 * sets, so a PostgREST client can never satisfy it — the generic direct-insert
 * client failed with 42501 every time. These tests pin the RPC name, the
 * two-argument shape, that minted columns never leave the client, and that the
 * columns each RPC does not write are still persisted.
 */

const updateSpy = vi.fn();
const insertSpy = vi.fn();
const eqSpy = vi.fn();
type PgResponse = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null };

const singleResult = vi.fn<() => Promise<PgResponse>>(async () => ({
  data: { id: "row-1" },
  error: null,
}));

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.select = vi.fn(chain);
  b.order = vi.fn(chain);
  b.limit = vi.fn(chain);
  b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  b.single = vi.fn(() => singleResult());
  b.eq = vi.fn((c: string, v: unknown) => { eqSpy(c, v); return b; });
  b.update = vi.fn((patch: unknown) => { updateSpy(patch); return b; });
  b.insert = vi.fn((rows: unknown) => { insertSpy(table, rows); return b; });
  b.delete = vi.fn(chain);
  b.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return b;
}

const rpcSpy = vi.fn<(name: string, args: unknown) => Promise<PgResponse>>();
const fromSpy = vi.fn((table: string) => makeBuilder(table));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcSpy(name, args),
    from: (table: string) => fromSpy(table),
  },
}));

import { entities } from "@/api/client/entities";
import { createBackcharge } from "@/lib/backcharge/repository";

const ok = (row: Record<string, unknown>): PgResponse => ({ data: { id: "row-1", ...row }, error: null });

beforeEach(() => {
  rpcSpy.mockReset();
  updateSpy.mockClear();
  insertSpy.mockClear();
  eqSpy.mockClear();
  fromSpy.mockClear();
  singleResult.mockClear();
});

describe.each([
  {
    label: "change order",
    rpc: "create_change_order",
    call: (r: Record<string, unknown>) => entities.ChangeOrder.create(r as never),
    minted: ["co_number", "project_name", "sov_line_number", "submitted_by"],
    record: { project_id: "p1", title: "Added embeds", co_amount: 4200 },
    keep: { title: "Added embeds" },
  },
  {
    label: "change request",
    rpc: "create_change_request",
    call: (r: Record<string, unknown>) => entities.ChangeRequest.create(r as never),
    minted: ["cr_number", "project_name", "change_order_id"],
    record: { project_id: "p1", title: "RFI 12 impact" },
    keep: { title: "RFI 12 impact" },
  },
  {
    label: "delivery",
    rpc: "create_delivery",
    call: (r: Record<string, unknown>) => entities.Delivery.create(r as never),
    minted: ["delivery_number", "project_name", "pieces", "weight_tons"],
    record: { project_id: "p1", delivery_title: "Load 3", items: [{ assembly_mark: "B1", qty: 2 }] },
    // The nested items array drives delivery_items and the derived tonnage —
    // stripping it would silently drop the whole load.
    keep: { delivery_title: "Load 3", items: [{ assembly_mark: "B1", qty: 2 }] },
  },
])("$label creation", ({ rpc, call, minted, record, keep }) => {
  it("calls the RPC with project id as its own argument", async () => {
    rpcSpy.mockResolvedValue(ok({}));
    await call(record);

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [name, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe(rpc);
    expect(args.p_project_id).toBe("p1");
    expect(args.p_payload).toMatchObject(keep);
    // project_id belongs in the argument, never the payload.
    expect(args.p_payload).not.toHaveProperty("project_id");
  });

  it("never forwards a column the database mints", async () => {
    rpcSpy.mockResolvedValue(ok({}));
    const polluted: Record<string, unknown> = { ...record };
    for (const column of minted) polluted[column] = "client-supplied";
    await call(polluted);

    const args = rpcSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    const payload = args.p_payload as Record<string, unknown>;
    for (const column of minted) {
      expect(payload, `${column} must not reach the RPC`).not.toHaveProperty(column);
    }
  });

  it("never issues a direct table insert", async () => {
    rpcSpy.mockResolvedValue(ok({}));
    await call(record);
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("is not registered as a plain createEntityClient", async () => {
    // A future edit reverting the registration would restore the 42501.
    rpcSpy.mockResolvedValue(ok({}));
    await call(record);
    expect(rpcSpy).toHaveBeenCalled();
  });

  it("rejects a create with no project id before calling the RPC", async () => {
    await expect(call({ ...record, project_id: undefined })).rejects.toThrow("project_id is required");
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});

describe("columns the RPC does not write", () => {
  it("carries a delivery's procurement fields through a follow-up write", async () => {
    rpcSpy.mockResolvedValue(ok({ delivery_title: "Load 3" }));
    await entities.Delivery.create({
      project_id: "p1",
      delivery_title: "Load 3",
      procurement_category: "Long lead",
      lead_time_weeks: 14,
      is_long_lead: true,
    } as never);

    expect(fromSpy).toHaveBeenCalledWith("deliveries");
    const patch = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).toMatchObject({
      procurement_category: "Long lead",
      lead_time_weeks: 14,
      is_long_lead: true,
    });
  });

  it("does not carry receipt or approval stamps", async () => {
    // The guards gate these on UPDATE too ("RECEIVE_VIA_RPC"), so carrying them
    // would turn a silent drop into a hard error on an otherwise good save.
    rpcSpy.mockResolvedValue(ok({}));
    await entities.Delivery.create({
      project_id: "p1",
      delivery_title: "Load 4",
      received_by: "someone",
      status: "Received",
    } as never);

    const patch = (updateSpy.mock.calls[0]?.[0] ?? {}) as Record<string, unknown>;
    expect(patch).not.toHaveProperty("received_by");
    expect(patch).not.toHaveProperty("status");
  });

  it("skips the follow-up write when nothing was dropped", async () => {
    rpcSpy.mockResolvedValue(ok({}));
    await entities.ChangeRequest.create({ project_id: "p1", title: "No extras" } as never);
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("bulk creation", () => {
  it("loops the single RPC in order", async () => {
    rpcSpy.mockResolvedValue(ok({}));
    await entities.ChangeOrder.bulkCreate([
      { project_id: "p1", title: "A", co_amount: 1 },
      { project_id: "p1", title: "B", co_amount: 2 },
    ] as never);

    expect(rpcSpy.mock.calls.map((c) => c[0])).toEqual([
      "create_change_order",
      "create_change_order",
    ]);
  });

  it("reports how many rows landed when a batch fails partway", async () => {
    rpcSpy
      .mockResolvedValueOnce(ok({}))
      .mockResolvedValueOnce({ data: null, error: { message: "title is required", code: "23514" } });

    await expect(
      entities.ChangeOrder.bulkCreate([
        { project_id: "p1", title: "A", co_amount: 1 },
        { project_id: "p1", title: "", co_amount: 2 },
      ] as never),
    ).rejects.toThrow(/1 of 2 change_orders records were created; row 2 failed/);
  });
});

describe("backcharges", () => {
  it("creates through create_backcharge and carries notice_date", async () => {
    rpcSpy.mockResolvedValue({
      data: { id: "bc-1", project_id: "p1", status: "draft", backcharge_number: "BC-001", title: "Crane standby" },
      error: null,
    });
    singleResult.mockResolvedValue({
      data: { id: "bc-1", project_id: "p1", status: "draft", title: "Crane standby", notice_date: "2026-09-10" },
      error: null,
    });

    const bc = await createBackcharge({
      project_id: "p1",
      title: "Crane standby",
      amount: 1800,
      notice_date: "2026-09-10",
    } as never);

    const [name, args] = rpcSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("create_backcharge");
    expect(args.p_project_id).toBe("p1");
    const payload = args.p_payload as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "Crane standby", amount: 1800 });
    // The RPC forces 'draft' and mints the number.
    expect(payload).not.toHaveProperty("backcharge_number");
    expect(payload).not.toHaveProperty("status");
    // No direct write to the guarded table. The backcharge_events insert below
    // is the notice_sent audit row and is expected.
    const backchargeInserts = insertSpy.mock.calls.filter((c) => c[0] === "backcharges");
    expect(backchargeInserts).toEqual([]);
    expect(bc.notice_date).toBe("2026-09-10");
  });

  it("does not write a duplicate 'created' event", async () => {
    // create_backcharge() already calls log_backcharge_event(... 'created' ...).
    rpcSpy.mockResolvedValue({
      data: { id: "bc-2", project_id: "p1", status: "draft", title: "Rework" },
      error: null,
    });

    await createBackcharge({ project_id: "p1", title: "Rework", amount: 10 } as never);

    const eventInserts = insertSpy.mock.calls.filter((c) => {
      const row = c[1] as Record<string, unknown> | undefined;
      return row && row.event_type === "created";
    });
    expect(eventInserts).toEqual([]);
  });
});
