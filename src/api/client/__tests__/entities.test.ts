import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

import { entities } from "@/api/client/entities";
import { supabase } from "@/lib/supabase";

describe("entities.SOVItem", () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
  });

  it("creates through the atomic SOV RPC without client-minted numbers", async () => {
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

    expect(supabase.rpc).toHaveBeenCalledWith("create_sov_item", {
      p_item: {
        project_id: "project-1",
        description: "Structural steel",
      },
    });
    expect(created).toMatchObject({
      line_item_number: 7,
      sov_id: "7",
      created_date: "2026-09-13T02:48:00Z",
    });
  });

  it("routes imports through the atomic batch RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: "sov-1", project_id: "project-1", line_item_number: 1 },
        { id: "sov-2", project_id: "project-1", line_item_number: 2 },
      ],
      error: null,
    } as never);

    const created = await entities.SOVItem.bulkCreate([
      { project_id: "project-1", description: "Detailing" },
      { project_id: "project-1", description: "Fabrication" },
    ]);

    expect(supabase.rpc).toHaveBeenCalledWith("create_sov_items", {
      p_items: [
        { project_id: "project-1", description: "Detailing" },
        { project_id: "project-1", description: "Fabrication" },
      ],
    });
    expect(created).toHaveLength(2);
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
