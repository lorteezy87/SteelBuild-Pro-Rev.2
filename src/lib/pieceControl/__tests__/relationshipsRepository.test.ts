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
  chain.is = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
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
    let workPackagesSelect = "";
    let sawDeletedFilter = false;
    const optionalSelects = new Map<string, string>();
    fromMock.mockImplementation((table: string) => {
      if (table === "work_packages") {
        const chain = chainFor({
          data: [
            {
              id: "wp-1",
              project_id: "project-1",
              wp_number: "WP-01",
              name: "Columns",
              is_deleted: false,
              deleted_at: null,
            },
            {
              id: "wp-dead",
              project_id: "project-1",
              wp_number: "WP-99",
              name: "Deleted package",
              is_deleted: true,
              deleted_at: "2026-07-01T00:00:00Z",
            },
          ],
          error: null,
        });
        chain.select = vi.fn((cols: string) => {
          workPackagesSelect = cols;
          return chain;
        });
        chain.eq = vi.fn((col: string, val: unknown) => {
          if (col === "is_deleted" && val === false) sawDeletedFilter = true;
          return chain;
        });
        chain.is = vi.fn((col: string, val: unknown) => {
          if (col === "deleted_at" && val === null) sawDeletedFilter = true;
          return chain;
        });
        return chain;
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
      const chain = chainFor({ data: [], error: null });
      chain.select = vi.fn((cols: string) => {
        optionalSelects.set(table, cols);
        return chain;
      });
      return chain;
    });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const snapshot = await fetchPieceRelationshipSnapshot("project-1");
    warn.mockRestore();

    expect(snapshot.pieces).toHaveLength(1);
    // Mock still returns both rows; client defense filter drops deleted.
    expect(snapshot.workPackages).toHaveLength(1);
    expect(snapshot.workPackages[0].id).toBe("wp-1");
    expect(snapshot.commentDispositions).toEqual([]);
    expect(workPackagesSelect).toContain("sequence_number");
    expect(workPackagesSelect).toContain("area");
    expect(workPackagesSelect).toContain("scheduled_start_date");
    expect(workPackagesSelect).not.toMatch(/\bdescription\b/);
    expect(sawDeletedFilter).toBe(true);
    expect(optionalSelects.get("drawings")).toContain("linked_rfi_ids");
    expect(optionalSelects.get("drawing_revisions")).toContain("issued_at");
    expect(optionalSelects.get("drawing_revisions")).toContain("received_at");
    expect(snapshot.sourceAvailability).toEqual({
      pieceDrawings: "available",
      pieceDrawingSets: "available",
      drawings: "available",
      drawingSets: "available",
      revisions: "available",
      approvals: "unavailable",
    });
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
