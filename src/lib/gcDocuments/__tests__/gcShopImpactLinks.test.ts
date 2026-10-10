import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGcShopImpactLinks, replaceGcShopImpactLinks } from "../gcShopImpactLinks";

const mock = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  range: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: mock.range,
  };
  return { supabase: { from: vi.fn(() => query), rpc: mock.rpc } };
});

beforeEach(() => {
  mock.rows = [];
  mock.range.mockReset();
  mock.rpc.mockReset();
  mock.range.mockImplementation(async (from: number, to: number) => ({
    data: mock.rows.slice(from, to + 1), error: null,
  }));
});

describe("GC issuance / shop drawing-set repository", () => {
  it("reads exact project links past the 1,000-row server cap", async () => {
    mock.rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `link-${index}`, project_id: "project-1", gc_drawing_set_id: `gc-${index}`,
      drawing_set_id: `shop-${index}`, created_by: null as string | null, created_at: "2026-10-07",
    }));
    const rows = await fetchGcShopImpactLinks("project-1");
    expect(rows).toHaveLength(1001);
    expect(rows.at(-1)?.drawing_set_id).toBe("shop-1000");
    expect(mock.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(mock.range).toHaveBeenNthCalledWith(2, 500, 999);
    expect(mock.range).toHaveBeenNthCalledWith(3, 1000, 1499);
  });

  it("fails closed when link evidence is missing or a later page fails", async () => {
    mock.range.mockResolvedValueOnce({ data: null, error: { message: "relation missing", code: "42P01" } });
    await expect(fetchGcShopImpactLinks("project-1")).rejects.toThrow(/unavailable/i);

    mock.rows = Array.from({ length: 500 }, (_, index) => ({ id: `link-${index}` }));
    mock.range.mockReset();
    mock.range
      .mockResolvedValueOnce({ data: mock.rows, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "page failed", code: "PGRST" } });
    await expect(fetchGcShopImpactLinks("project-1")).rejects.toThrow(/page failed/i);
  });

  it("sends only deliberate IDs and refuses an unconfirmed server response", async () => {
    mock.rpc.mockResolvedValueOnce({ data: {
      project_id: "project-1", gc_drawing_set_id: "gc-1",
      shop_set_ids: ["shop-a"], added_count: 1, removed_count: 0, unchanged: false,
    }, error: null });
    await replaceGcShopImpactLinks("project-1", "gc-1", ["shop-a"]);
    expect(mock.rpc).toHaveBeenCalledWith("replace_gc_issuance_shop_set_links", {
      p_project_id: "project-1", p_gc_drawing_set_id: "gc-1", p_shop_set_ids: ["shop-a"],
    });

    mock.rpc.mockResolvedValueOnce({ data: {
      project_id: "project-1", gc_drawing_set_id: "gc-1",
      shop_set_ids: ["shop-b"], added_count: 1, removed_count: 0, unchanged: false,
    }, error: null });
    await expect(replaceGcShopImpactLinks("project-1", "gc-1", ["shop-a"]))
      .rejects.toThrow(/did not confirm the exact/i);
    mock.rpc.mockResolvedValueOnce({ data: {
      project_id: "project-1", gc_drawing_set_id: "gc-1",
      shop_set_ids: ["shop-a"], added_count: -1, removed_count: 0, unchanged: false,
    }, error: null });
    await expect(replaceGcShopImpactLinks("project-1", "gc-1", ["shop-a"]))
      .rejects.toThrow(/did not confirm the exact/i);
    await expect(replaceGcShopImpactLinks("project-1", "gc-1", ["shop-a", "shop-a"]))
      .rejects.toThrow(/duplicates/i);
    expect(mock.rpc).toHaveBeenCalledTimes(3);
  });
});
