import { describe, expect, it } from "vitest";
import {
  applyAttentionFocus,
  presentImportReconciliationText,
  uniqueValues,
  buildWorkPackageLabelMap,
  buildPieceDisplayRows,
  buildFilteredRegisterRows,
  archiveConfirmationText,
  allRowsSelected,
  buildSelectedPieceImpact,
} from "../registerHelpers";

describe("uniqueValues", () => {
  it("dedupes, drops nullish/empty, and natural-sorts", () => {
    expect(uniqueValues(["B10", null, "A2", "", "A10", "A2", undefined])).toEqual([
      "A2",
      "A10",
      "B10",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(uniqueValues([])).toEqual([]);
  });
});

describe("presentImportReconciliationText", () => {
  it("rewrites the split-lots warning to plain language", () => {
    expect(
      presentImportReconciliationText(
        "mark has split lots but no active ALL root",
      ),
    ).toBe("This piece mark has split lots but no active parent record.");
  });

  it("passes through other messages unchanged", () => {
    expect(presentImportReconciliationText("qty mismatch")).toBe("qty mismatch");
  });
});

describe("applyAttentionFocus", () => {
  const rows = [
    { id: "1", work_package_id: null, on_hold: false, weight_each_lbs: 10 },
    { id: "2", work_package_id: "wp-1", on_hold: true, weight_each_lbs: 20 },
    { id: "3", work_package_id: "wp-2", on_hold: false, weight_each_lbs: null },
  ];

  it("returns the same rows when focus is null", () => {
    expect(applyAttentionFocus(rows, null)).toEqual(rows);
  });

  it("filters unassigned", () => {
    expect(applyAttentionFocus(rows, "unassigned").map((r) => r.id)).toEqual([
      "1",
    ]);
  });

  it("filters held", () => {
    expect(applyAttentionFocus(rows, "held").map((r) => r.id)).toEqual(["2"]);
  });
});

describe("piece register display/filter helpers", () => {
  it("maps work package labels and builds display rows", () => {
    const map = buildWorkPackageLabelMap([
      { id: "wp1", wp_number: "WP-1", name: "Columns" },
      { name: "no-id" } as any,
    ]);
    expect(map.has("wp1")).toBe(true);
    const rows = buildPieceDisplayRows(
      [
        { id: "p1", work_package_id: "wp1", piece_mark: "A1" } as any,
        { id: "p2", work_package_id: null, piece_mark: "B1" } as any,
      ],
      map,
    );
    expect(rows[0].workPackageLabel).toBe(map.get("wp1"));
    expect(rows[1].workPackageLabel).toBe("Unassigned");
  });

  it("filters/sorts and selection helpers", () => {
    const display = [
      { id: "1", piece_mark: "C2", workPackageLabel: "WP", profile: "W", material_grade: "A992", lifecycle_status: "Fabricated", source_system: "tekla", on_hold: false, work_package_id: "wp1" },
      { id: "2", piece_mark: "A1", workPackageLabel: "WP", profile: "W", material_grade: "A992", lifecycle_status: "Released", source_system: "tekla", on_hold: true, work_package_id: null },
    ] as any;
    const filters = {
      search: "",
      workPackageId: "",
      profile: "",
      grade: "",
      lifecycle: "",
      source: "",
      hold: "all" as const,
    };
    const held = buildFilteredRegisterRows(display, filters, "held", { key: "piece_mark", dir: "asc" } as any);
    expect(held.map((r) => r.id)).toEqual(["2"]);
    expect(archiveConfirmationText(1)).toBe("ARCHIVE 1 PIECE");
    expect(archiveConfirmationText(3)).toBe("ARCHIVE 3 PIECES");
    expect(allRowsSelected(display, new Set(["1", "2"]))).toBe(true);
    expect(allRowsSelected(display, new Set(["1"]))).toBe(false);
  });

  it("returns null impact without selection/snapshot", () => {
    expect(buildSelectedPieceImpact(null, null)).toBeNull();
    expect(buildSelectedPieceImpact("p1", { pieces: [], pieceDrawings: [], commentDispositions: [], drawings: [], drawingSets: [], submittals: [], sheetResponses: [], drawingRevisions: [], drawingReviews: [], drawingSignoffs: [] })).toBeNull();
  });
});
