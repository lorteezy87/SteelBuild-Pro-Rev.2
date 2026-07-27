import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("../repository", () => ({
  fetchPieceRegister: vi.fn(),
}));

import { fetchPieceRegister } from "../repository";
import { fetchPieceRelationshipSnapshot } from "../relationshipsRepository";

function chainFor(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.range = vi.fn(async () => result);
  return chain;
}

describe("fetchPieceRelationshipSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPieceRegister).mockResolvedValue([
      {
        id: "piece-1",
        project_id: "project-1",
        piece_mark: "B1",
        normalized_piece_mark: "B1",
        lot_code: "ALL",
        parent_piece_id: null,
        quantity: 1,
        profile: null,
        material_grade: null,
        weight_each_lbs: null,
        weight_total_lbs: null,
        work_package_id: null,
        lifecycle_status: "not_started",
        on_hold: false,
        source_system: null,
        external_ref: null,
        metadata: null,
        updated_at: "2026-07-01T00:00:00Z",
        deleted_at: null,
      },
    ]);
  });

  it("soft-fails optional tables so a missing dispositions table still loads core rows", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "work_packages") {
        return chainFor({
          data: [
            {
              id: "wp-1",
              project_id: "project-1",
              wp_number: "WP-01",
              name: "Columns",
              is_deleted: false,
              deleted_at: null,
            },
          ],
          error: null,
        });
      }
      if (table === "submittal_comment_dispositions") {
        return chainFor({
          data: null,
          error: {
            message:
              "Could not find the table 'public.submittal_comment_dispositions' in the schema cache",
            code: "PGRST205",
          },
        });
      }
      return chainFor({ data: [], error: null });
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const snapshot = await fetchPieceRelationshipSnapshot("project-1");
    warn.mockRestore();

    expect(snapshot.pieces).toHaveLength(1);
    expect(snapshot.workPackages).toHaveLength(1);
    expect(snapshot.commentDispositions).toEqual([]);
  });

  it("fails closed when work_packages cannot load", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "work_packages") {
        return chainFor({
          data: null,
          error: { message: "permission denied for table work_packages", code: "42501" },
        });
      }
      return chainFor({ data: [], error: null });
    });

    await expect(fetchPieceRelationshipSnapshot("project-1")).rejects.toThrow(
      /\[work_packages\]/i,
    );
  });
});
