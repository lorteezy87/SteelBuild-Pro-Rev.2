import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_COLUMN_ID,
  buildPackageBoardColumns,
  type BoardPiece,
  type BoardWorkPackage,
} from "../packageBoard.derive";

function piece(overrides: Partial<BoardPiece> & Pick<BoardPiece, "id" | "piece_mark">): BoardPiece {
  return {
    lot_code: "ALL",
    lifecycle_status: "not_started",
    work_package_id: null,
    quantity: 1,
    weight_each_lbs: 2000,
    weight_total_lbs: 2000,
    parent_piece_id: null,
    is_container: false,
    is_deleted: false,
    deleted_at: null,
    ...overrides,
  };
}

const packages: BoardWorkPackage[] = [
  { id: "wp-b", wp_number: "WP-002", name: "Second" },
  { id: "wp-a", wp_number: "WP-001", name: "First" },
  { id: "wp-gone", wp_number: "WP-X", is_deleted: true, deleted_at: "2026-01-01" },
];

describe("buildPackageBoardColumns", () => {
  it("groups leaves into Unassigned + WP columns sorted by wp_number", () => {
    const columns = buildPackageBoardColumns({
      pieces: [
        piece({ id: "p1", piece_mark: "C2", work_package_id: "wp-a" }),
        piece({ id: "p2", piece_mark: "C1", work_package_id: null }),
        piece({ id: "p3", piece_mark: "B1", work_package_id: "wp-b" }),
      ],
      workPackages: packages,
    });

    expect(columns.map((c) => c.id)).toEqual([
      UNASSIGNED_COLUMN_ID,
      "wp-a",
      "wp-b",
    ]);
    expect(columns[0].pieces.map((p) => p.piece_mark)).toEqual(["C1"]);
    expect(columns[1].title).toContain("WP-001");
    expect(columns[1].pieces.map((p) => p.piece_mark)).toEqual(["C2"]);
    expect(columns[2].pieces.map((p) => p.piece_mark)).toEqual(["B1"]);
  });

  it("excludes containers and split parents from cards", () => {
    const columns = buildPackageBoardColumns({
      pieces: [
        piece({ id: "parent", piece_mark: "C1", is_container: true, quantity: 10 }),
        piece({
          id: "child",
          piece_mark: "C1",
          lot_code: "A",
          parent_piece_id: "parent",
          work_package_id: "wp-a",
        }),
        piece({
          id: "orphan-parent",
          piece_mark: "D1",
          quantity: 4,
          // has a child → treated as split parent, not a leaf
        }),
        piece({
          id: "orphan-child",
          piece_mark: "D1",
          lot_code: "B",
          parent_piece_id: "orphan-parent",
        }),
      ],
      workPackages: packages,
    });

    const allMarks = columns.flatMap((c) => c.pieces.map((p) => `${p.piece_mark}:${p.lot_code}`));
    expect(allMarks).toEqual(["D1:B", "C1:A"]);
  });

  it("filters by mark substring and lifecycle equality", () => {
    const columns = buildPackageBoardColumns({
      pieces: [
        piece({ id: "p1", piece_mark: "C1", lifecycle_status: "released" }),
        piece({ id: "p2", piece_mark: "C10", lifecycle_status: "fabricated" }),
        piece({ id: "p3", piece_mark: "B1", lifecycle_status: "released" }),
      ],
      workPackages: packages,
      markFilter: "c1",
      lifecycleFilter: "released",
    });

    expect(columns[0].pieces.map((p) => p.id)).toEqual(["p1"]);
  });

  it("sums known tons and ignores unknown weight", () => {
    const columns = buildPackageBoardColumns({
      pieces: [
        piece({
          id: "p1",
          piece_mark: "A1",
          work_package_id: "wp-a",
          weight_each_lbs: 4000,
          weight_total_lbs: 4000,
        }),
        piece({
          id: "p2",
          piece_mark: "A2",
          work_package_id: "wp-a",
          weight_each_lbs: null,
          weight_total_lbs: null,
        }),
      ],
      workPackages: packages,
    });

    const wpCol = columns.find((c) => c.id === "wp-a");
    expect(wpCol?.leafCount).toBe(2);
    expect(wpCol?.knownTons).toBe(2);
  });

  it("applies assignment overrides for optimistic UI", () => {
    const columns = buildPackageBoardColumns({
      pieces: [piece({ id: "p1", piece_mark: "C1", work_package_id: null })],
      workPackages: packages,
      assignmentOverrides: { p1: "wp-b" },
    });

    expect(columns.find((c) => c.id === "wp-b")?.pieces.map((p) => p.id)).toEqual(["p1"]);
    expect(columns[0].pieces).toHaveLength(0);
  });

  it("treats pieces on deleted WPs as unassigned", () => {
    const columns = buildPackageBoardColumns({
      pieces: [piece({ id: "p1", piece_mark: "C1", work_package_id: "wp-gone" })],
      workPackages: packages,
    });

    expect(columns.map((c) => c.id)).not.toContain("wp-gone");
    expect(columns[0].pieces.map((p) => p.id)).toEqual(["p1"]);
  });
});
