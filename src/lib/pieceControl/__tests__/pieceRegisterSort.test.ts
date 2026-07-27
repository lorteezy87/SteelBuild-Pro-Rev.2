import { describe, expect, it } from "vitest";
import {
  nextPieceRegisterSort,
  sortPieceRegisterRows,
} from "../pieceRegisterSort";

describe("sortPieceRegisterRows", () => {
  const rows = [
    {
      id: "1",
      piece_mark: "C-201",
      lot_code: "ALL",
      work_package_id: "wp-2",
      workPackageLabel: "WP-002 - Beams",
      updated_at: "2026-07-01T00:00:00Z",
    },
    {
      id: "2",
      piece_mark: "B-101",
      lot_code: "ALL",
      work_package_id: null,
      workPackageLabel: "Unassigned",
      updated_at: "2026-07-03T00:00:00Z",
    },
    {
      id: "3",
      piece_mark: "B-102",
      lot_code: "ALL",
      work_package_id: "wp-1",
      workPackageLabel: "WP-001 - Embeds",
      updated_at: "2026-07-02T00:00:00Z",
    },
    {
      id: "4",
      piece_mark: "A-10",
      lot_code: "ALL",
      work_package_id: "wp-1",
      workPackageLabel: "WP-001 - Embeds",
      updated_at: "2026-07-04T00:00:00Z",
    },
  ];

  it("sorts by work package then mark, with unassigned last", () => {
    const sorted = sortPieceRegisterRows(rows, {
      key: "work_package",
      direction: "asc",
    });
    expect(sorted.map((row) => row.id)).toEqual(["4", "3", "1", "2"]);
  });

  it("sorts by mark", () => {
    const sorted = sortPieceRegisterRows(rows, {
      key: "mark",
      direction: "asc",
    });
    expect(sorted.map((row) => row.piece_mark)).toEqual([
      "A-10",
      "B-101",
      "B-102",
      "C-201",
    ]);
  });

  it("toggles direction when the same key is clicked again", () => {
    expect(
      nextPieceRegisterSort({ key: "work_package", direction: "asc" }, "work_package"),
    ).toEqual({ key: "work_package", direction: "desc" });
    expect(
      nextPieceRegisterSort({ key: "mark", direction: "asc" }, "work_package"),
    ).toEqual({ key: "work_package", direction: "asc" });
  });
});
