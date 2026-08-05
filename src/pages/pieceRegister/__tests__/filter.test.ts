import { describe, expect, it } from "vitest";
import { filterPieceRegisterRows, type PieceRegisterDisplayRow } from "../filter";

const rows: PieceRegisterDisplayRow[] = [
  {
    id: "1",
    project_id: "p1",
    piece_mark: "B-101",
    normalized_piece_mark: "B-101",
    lot_code: "ALL",
    parent_piece_id: null,
    quantity: 2,
    profile: "W12X26",
    material_grade: "A992",
    weight_each_lbs: 100,
    weight_total_lbs: 200,
    work_package_id: "wp-1",
    workPackageLabel: "WP-010",
    lifecycle_status: "not_started",
    on_hold: false,
    is_container: false,
    source_system: "csv",
    external_ref: null,
    metadata: null,
    updated_at: "2026-07-18T00:00:00Z",
    deleted_at: null,
  },
  {
    id: "2",
    project_id: "p1",
    piece_mark: "C-201",
    normalized_piece_mark: "C-201",
    lot_code: "ALL",
    parent_piece_id: null,
    quantity: 1,
    profile: "HSS6X6",
    material_grade: "A500",
    weight_each_lbs: 80,
    weight_total_lbs: 80,
    work_package_id: null,
    workPackageLabel: "Unassigned",
    lifecycle_status: "in_fabrication",
    on_hold: true,
    source_system: "ifc",
    external_ref: null,
    metadata: null,
    updated_at: "2026-07-18T00:00:00Z",
    deleted_at: null,
  },
];

describe("Piece Register filters", () => {
  it("searches across marks, packages, profile, grade, and source", () => {
    const result = filterPieceRegisterRows(rows, {
      search: "WP-010",
      workPackageId: "",
      profile: "",
      grade: "",
      lifecycle: "",
      source: "",
      hold: "all",
    });
    expect(result.map((row) => row.id)).toEqual(["1"]);
  });

  it("combines lifecycle, source, and hold filters", () => {
    const result = filterPieceRegisterRows(rows, {
      search: "",
      workPackageId: "",
      profile: "",
      grade: "",
      lifecycle: "in_fabrication",
      source: "ifc",
      hold: "held",
    });
    expect(result.map((row) => row.id)).toEqual(["2"]);
  });
});
