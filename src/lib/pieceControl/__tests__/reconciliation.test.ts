import { describe, expect, it } from "vitest";
import { normalizeImportRows, reconcileImportRows, type CanonicalPieceForReconciliation } from "../reconciliation";

function root(overrides: Partial<CanonicalPieceForReconciliation> = {}): CanonicalPieceForReconciliation {
  return {
    id: "piece-1",
    project_id: "project-1",
    piece_mark: "B-101",
    normalized_piece_mark: "B-101",
    lot_code: "ALL",
    parent_piece_id: null,
    quantity: 2,
    weight_each_lbs: 100,
    weight_total_lbs: 200,
    profile: "W12X26",
    material_grade: "A992",
    length_inches: 240,
    sequence_number: "10",
    erection_area: "A",
    external_ref: "source-1",
    deleted_at: null,
    ...overrides,
  };
}

describe("piece import reconciliation", () => {
  it("normalizes marks and classifies new, unchanged, and eligible root updates", () => {
    const rows = normalizeImportRows([
      { piece_mark: " b-101 ", quantity: 2, weight_total_lbs: 200, profile: "W12X26", material_grade: "A992", external_ref: "source-1" },
      { piece_mark: "B-102", quantity: 1, profile: "HSS6X6" },
      { piece_mark: "B-103", quantity: 4 },
    ], "csv");

    const results = reconcileImportRows(rows, [
      root({ length_inches: null, sequence_number: null, erection_area: null }),
      root({ id: "piece-3", piece_mark: "B-103", normalized_piece_mark: "B-103", quantity: 1, weight_each_lbs: null, weight_total_lbs: null, profile: null, material_grade: null, length_inches: null, sequence_number: null, erection_area: null, external_ref: null }),
    ]);

    expect(results.map((row) => row.decision)).toEqual(["unchanged", "new", "update_candidate"]);
    expect(results[0].normalizedPieceMark).toBe("B-101");
  });

  it("flags malformed rows, duplicates, and conflicting physical metadata", () => {
    const rows = normalizeImportRows([
      { piece_mark: "", quantity: "two" },
      { piece_mark: "B-102", quantity: 1 },
      { piece_mark: "b-102", quantity: 1 },
      { piece_mark: "B-101", quantity: 2, profile: "W14X30" },
    ], "csv");
    const results = reconcileImportRows(rows, [root()]);

    expect(results[0].decision).toBe("invalid");
    expect(results[1].warnings).toContain("duplicate source row");
    expect(results[2].decision).toBe("conflict");
    expect(results[3].warnings).toContain("conflicting profile");
  });

  it("allows an eligible root update but refuses the same change after lot splitting", () => {
    const row = normalizeImportRows([{ piece_mark: "B-101", quantity: 3 }], "csv");
    expect(reconcileImportRows(row, [root()])[0].decision).toBe("update_candidate");

    const child = root({
      id: "child-1",
      lot_code: "LOT-01",
      parent_piece_id: "piece-1",
      quantity: 1,
    });
    const result = reconcileImportRows(row, [root(), child])[0];
    expect(result.decision).toBe("conflict");
    expect(result.warnings).toContain("automatic changes to a split lot are not allowed");
  });
});

