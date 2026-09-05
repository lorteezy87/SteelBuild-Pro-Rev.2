import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bridge must never write `pieces` directly (SELECT-only for browser
 * sessions). Canonical lots go through the sync_production_stages_to_pieces
 * RPC; model_elements.fab_status is still a direct batched update.
 */
const mocks = vi.hoisted(() => {
  const state = {
    mode: "live" as string,
    rpc: vi.fn(),
    updates: [] as Array<{ table: string; patch: Record<string, unknown>; ids: string[] }>,
    roster: [] as Array<{ id: string; piece_mark: string }>,
  };
  const from = vi.fn((table: string) => {
    if (table === "projects") {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({
        data: { piece_control_mode: state.mode },
        error: null,
      }));
      return chain;
    }
    if (table === "model_elements") {
      return {
        select: vi.fn(() => {
          const chain: Record<string, unknown> = {};
          chain.eq = vi.fn(() => chain);
          chain.order = vi.fn(() => chain);
          chain.range = vi.fn(async () => ({ data: state.roster, error: null }));
          return chain;
        }),
        update: vi.fn((patch: Record<string, unknown>) => ({
          in: vi.fn(async (_col: string, ids: string[]) => {
            state.updates.push({ table, patch, ids });
            return { error: null };
          }),
        })),
      };
    }
    if (table === "pieces") {
      throw new Error("bridge must not touch pieces directly");
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { state, from };
});

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.state.rpc },
}));

vi.mock("@/lib/ifc/fetchAllModelElements", () => ({
  fetchAllModelElements: vi.fn(async () => mocks.state.roster),
}));

import { syncProductionRowsToModelAndPieces } from "../productionToFabBridge";

const rows = [
  { action: "create", piece_mark: "1B1", status: "Paint" },
  { action: "create", piece_mark: "1B2", status: "Shipped" },
  { action: "create", piece_mark: "C1", status: "Not Started" },
] as any[];

describe("syncProductionRowsToModelAndPieces", () => {
  beforeEach(() => {
    mocks.state.mode = "live";
    mocks.state.updates.length = 0;
    mocks.state.roster = [
      { id: "e1", piece_mark: "1B1" },
      { id: "e2", piece_mark: "1b1" },
      { id: "e3", piece_mark: "1B2" },
    ];
    mocks.state.rpc.mockReset();
    mocks.from.mockClear();
  });

  it("updates model_elements by mark and drives canonical lots through the sync RPC", async () => {
    mocks.state.rpc.mockResolvedValue({
      data: {
        project_id: "p1",
        source: "production_import",
        requested: 2,
        advanced: 1,
        unchanged: 0,
        skipped: 1,
        results: [
          { mark: "1B1", piece_id: "x", status: "advanced", completions_added: 6, shipped: false },
          { mark: "1B2", status: "skipped", reason: "no_leaf_lot" },
        ],
        atomic: false,
      },
      error: null,
    });

    const summary = await syncProductionRowsToModelAndPieces("p1", rows, { source: "production_import" });

    // Legacy roster: both 1B1 parts → fabricated, 1B2 → shipped.
    const byStatus = Object.fromEntries(
      mocks.state.updates.map((u) => [u.patch.fab_status, u.ids.sort()]),
    );
    expect(byStatus).toEqual({ fabricated: ["e1", "e2"], shipped: ["e3"] });
    expect(summary.modelElementsUpdated).toBe(3);

    // Canonical path: one RPC call with the planned per-mark targets.
    expect(mocks.state.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = mocks.state.rpc.mock.calls[0];
    expect(name).toBe("sync_production_stages_to_pieces");
    expect(args).toEqual({
      p_project_id: "p1",
      p_updates: [
        { mark: "1B1", target_station: "ready_to_ship", ship: false },
        { mark: "1B2", target_station: "ready_to_ship", ship: true },
      ],
      p_source: "production_import",
    });
    expect(summary.mode).toBe("live");
    expect(summary.piecesAdvanced).toBe(1);
    expect(summary.piecesSkipped).toBe(1);
    expect(summary.results).toHaveLength(2);
    expect(summary.rpcMissing).toBe(false);
  });

  it("skips the canonical path entirely when piece control is off", async () => {
    mocks.state.mode = "off";
    const summary = await syncProductionRowsToModelAndPieces("p1", rows);
    expect(mocks.state.rpc).not.toHaveBeenCalled();
    expect(summary.mode).toBe("off");
    expect(summary.modelElementsUpdated).toBe(3);
  });

  it("reports a missing RPC instead of falling back to a direct pieces write", async () => {
    mocks.state.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function public.sync_production_stages_to_pieces" },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const summary = await syncProductionRowsToModelAndPieces("p1", rows);
    warn.mockRestore();
    expect(summary.rpcMissing).toBe(true);
    expect(summary.piecesSkipped).toBe(2);
    expect(summary.piecesAdvanced).toBe(0);
  });

  it("surfaces a structured RPC failure as an error", async () => {
    mocks.state.rpc.mockResolvedValue({
      data: { ok: false, error_message: "Piece control is disabled for this project", failure_id: "f1" },
      error: null,
    });
    await expect(syncProductionRowsToModelAndPieces("p1", rows)).rejects.toThrow(/disabled/);
  });
});
