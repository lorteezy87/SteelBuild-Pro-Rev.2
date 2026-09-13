import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSingle = vi.fn();
const fromUpdate = vi.fn(() => ({
  update: () => ({ eq: () => ({ select: () => ({ single: updateSingle }) }) }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    from: (...args: unknown[]) => fromUpdate(...(args as [])),
  },
}));

import { entities } from "@/api/client/entities";
import { supabase } from "@/lib/supabase";

/**
 * SOV line numbers are official project records. The database mints them in
 * the inserting transaction (create_sov_item -> get_next_sequence_number) and
 * a BEFORE INSERT guard on sov_items rejects a direct table write, so these
 * tests pin the RPC shape: get it wrong and every SOV create fails in
 * production with "Use create_sov_item() - SOV line numbers are minted there".
 */
describe("entities.SOVItem", () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
    updateSingle.mockReset();
    fromUpdate.mockClear();
  });

  it("creates through the SOV RPC, project id as its own argument", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        id: "sov-1",
        project_id: "project-1",
        line_item_number: 7,
        sov_id: "7",
        created_at: "2026-09-13T02:48:00Z",
      },
      error: null,
    } as never);

    const created = await entities.SOVItem.create({
      project_id: "project-1",
      description: "Structural steel",
      line_item_number: 99,
      sov_id: "SOV-099",
    });

    // p_project_id is a separate argument, NOT a payload key — the deployed
    // function is create_sov_item(p_project_id uuid, p_payload jsonb).
    expect(supabase.rpc).toHaveBeenCalledWith("create_sov_item", {
      p_project_id: "project-1",
      p_payload: {
        description: "Structural steel",
      },
    });
    expect(created).toMatchObject({
      line_item_number: 7,
      sov_id: "7",
      created_date: "2026-09-13T02:48:00Z",
    });
  });

  it("never forwards a client-supplied line number", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: "sov-1", project_id: "project-1", line_item_number: 1 },
      error: null,
    } as never);

    await entities.SOVItem.create({
      project_id: "project-1",
      description: "Detailing",
      line_item_number: 42,
      sov_id: "SOV-042",
    });

    const args = vi.mocked(supabase.rpc).mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    const payload = args?.p_payload as Record<string, unknown> | undefined;
    expect(payload).not.toHaveProperty("line_item_number");
    expect(payload).not.toHaveProperty("sov_id");
    expect(payload).not.toHaveProperty("project_id");
  });

  it("rejects a create with no project id before calling the RPC", async () => {
    await expect(
      entities.SOVItem.create({ description: "Orphan line" } as never),
    ).rejects.toThrow("project_id is required");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("imports one row per call, in the order given", async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: { id: "sov-1", project_id: "project-1", line_item_number: 1 },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: { id: "sov-2", project_id: "project-1", line_item_number: 2 },
        error: null,
      } as never);

    const created = await entities.SOVItem.bulkCreate([
      { project_id: "project-1", description: "Detailing" },
      { project_id: "project-1", description: "Fabrication" },
    ]);

    // There is no bulk overload deployed; sequential single calls keep the
    // minted numbers in the caller's order.
    expect(vi.mocked(supabase.rpc).mock.calls.map((c) => c[0])).toEqual([
      "create_sov_item",
      "create_sov_item",
    ]);
    expect(created.map((row) => row.line_item_number)).toEqual([1, 2]);
  });

  it("reports how many rows landed when an import fails partway", async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({
        data: { id: "sov-1", project_id: "project-1", line_item_number: 1 },
        error: null,
      } as never)
      .mockResolvedValueOnce({
        data: null,
        error: { message: "description is required", code: "23514" },
      } as never);

    // The loop is not one transaction. Row 1 is already committed, so a bare
    // "import failed" would be a lie about the state of the SOV.
    await expect(
      entities.SOVItem.bulkCreate([
        { project_id: "project-1", description: "Detailing" },
        { project_id: "project-1", description: "" },
      ]),
    ).rejects.toThrow(
      "1 of 2 SOV line items were created; row 2 failed: [sov_items.create] description is required",
    );
  });

  it("writes back the pay-application columns the RPC does not set", async () => {
    // create_sov_item() inserts a fixed column list that omits
    // application_number / period_* / submitted_date / payment_received_date.
    // SOVFormModal collects all four, so dropping them loses what the PM typed.
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: "sov-1", project_id: "project-1", line_item_number: 3 },
      error: null,
    } as never);
    updateSingle.mockResolvedValue({
      data: {
        id: "sov-1",
        project_id: "project-1",
        line_item_number: 3,
        application_number: 4,
        period_from: "2026-09-01",
        period_to: "2026-09-30",
      },
      error: null,
    });

    const created = await entities.SOVItem.create({
      project_id: "project-1",
      description: "Erection",
      application_number: 4,
      period_from: "2026-09-01",
      period_to: "2026-09-30",
    } as never);

    // They must not ride along in the RPC payload — the function ignores them.
    const rpcArgs = vi.mocked(supabase.rpc).mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(rpcArgs?.p_payload).toMatchObject({ description: "Erection" });

    expect(fromUpdate).toHaveBeenCalledWith("sov_items");
    expect(created).toMatchObject({
      application_number: 4,
      period_from: "2026-09-01",
      period_to: "2026-09-30",
    });
  });

  it("skips the follow-up write when no ignored column was supplied", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { id: "sov-1", project_id: "project-1", line_item_number: 1 },
      error: null,
    } as never);

    await entities.SOVItem.create({
      project_id: "project-1",
      description: "Detailing",
    });

    expect(fromUpdate).not.toHaveBeenCalled();
  });

  it("preserves SOV operation context when the RPC fails", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    } as never);

    await expect(
      entities.SOVItem.create({ project_id: "project-1" }),
    ).rejects.toThrow("[sov_items.create] permission denied");
  });
});
