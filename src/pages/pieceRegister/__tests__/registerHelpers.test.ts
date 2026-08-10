import { describe, expect, it } from "vitest";
import type { PieceRegisterSort } from "@/lib/pieceControl/pieceRegisterSort";
import type { PieceRegisterRow } from "@/lib/pieceControl/repository";
import type {
  PieceRegisterDisplayRow,
  PieceRegisterFilters,
} from "../filter";
import {
  allRowsSelected,
  applyAttentionFocus,
  archiveConfirmationText,
  buildFilteredRegisterRows,
  buildPieceDisplayRows,
  buildSelectedPieceImpact,
  buildWorkPackageLabelMap,
  EMPTY_PIECE_REGISTER_FILTERS,
  IMPORT_DECISION_TONE,
  PIECE_REGISTER_VIEW_IDS,
  PIECE_REGISTER_VIEW_LABELS,
  presentImportReconciliationText,
  resolvePieceRegisterView,
  uniqueValues,
  type PieceImpactSnapshotLike,
} from "../registerHelpers";

function makePiece(overrides: Partial<PieceRegisterRow> = {}): PieceRegisterRow {
  return {
    id: "piece-1",
    project_id: "project-1",
    piece_mark: "A1",
    normalized_piece_mark: "A1",
    lot_code: "ALL",
    parent_piece_id: null,
    quantity: 1,
    profile: "W12X26",
    material_grade: "A992",
    weight_each_lbs: 100,
    weight_total_lbs: 100,
    work_package_id: null,
    lifecycle_status: "not_started",
    on_hold: false,
    source_system: "csv",
    external_ref: null,
    metadata: null,
    updated_at: "2026-08-01T12:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

function makeDisplayRow(
  overrides: Partial<PieceRegisterRow> & { workPackageLabel?: string } = {},
): PieceRegisterDisplayRow {
  const { workPackageLabel, ...pieceOverrides } = overrides;
  const piece = makePiece(pieceOverrides);
  return {
    ...piece,
    workPackageLabel:
      workPackageLabel ?? (piece.work_package_id ? "WP-001 - Main Steel" : "Unassigned"),
  };
}

const emptyFilters: PieceRegisterFilters = {
  ...EMPTY_PIECE_REGISTER_FILTERS,
};

const markAscending: PieceRegisterSort = {
  key: "mark",
  direction: "asc",
};

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
    makePiece({ id: "1", work_package_id: null, weight_total_lbs: 10 }),
    makePiece({ id: "2", work_package_id: "wp-1", on_hold: true, weight_total_lbs: 20 }),
    makePiece({
      id: "3",
      work_package_id: "wp-2",
      weight_each_lbs: null,
      weight_total_lbs: null,
    }),
  ];

  it("returns all rows when focus is null", () => {
    expect(applyAttentionFocus(rows, null)).toEqual(rows);
  });

  it("filters unassigned", () => {
    expect(applyAttentionFocus(rows, "unassigned").map((row) => row.id)).toEqual([
      "1",
    ]);
  });

  it("filters held", () => {
    expect(applyAttentionFocus(rows, "held").map((row) => row.id)).toEqual(["2"]);
  });

  it("filters pieces with no usable weight", () => {
    expect(
      applyAttentionFocus(rows, "missing-weight").map((row) => row.id),
    ).toEqual(["3"]);
  });
});

describe("piece register display/filter helpers", () => {
  it("maps work package labels and builds display rows", () => {
    const map = buildWorkPackageLabelMap([
      { id: "wp1", wp_number: "WP-1", name: "Columns" },
      { name: "no-id" },
    ]);
    expect(map.get("wp1")).toBe("WP-1 - Columns");
    const rows = buildPieceDisplayRows(
      [
        makePiece({ id: "p1", work_package_id: "wp1", piece_mark: "A1" }),
        makePiece({ id: "p2", work_package_id: null, piece_mark: "B1" }),
      ],
      map,
    );
    expect(rows[0].workPackageLabel).toBe("WP-1 - Columns");
    expect(rows[1].workPackageLabel).toBe("Unassigned");
  });

  it("uses the production sort contract and applies attention filters", () => {
    const display = [
      makeDisplayRow({
        id: "1",
        piece_mark: "C2",
        normalized_piece_mark: "C2",
        lifecycle_status: "fabricated",
        work_package_id: "wp1",
      }),
      makeDisplayRow({
        id: "2",
        piece_mark: "A1",
        normalized_piece_mark: "A1",
        lifecycle_status: "released",
        on_hold: true,
        work_package_id: null,
      }),
    ];

    const sorted = buildFilteredRegisterRows(
      display,
      emptyFilters,
      null,
      markAscending,
    );
    expect(sorted.map((row) => row.id)).toEqual(["2", "1"]);

    const held = buildFilteredRegisterRows(
      display,
      emptyFilters,
      "held",
      markAscending,
    );
    expect(held.map((row) => row.id)).toEqual(["2"]);
  });

  it("builds archive confirmation and visible-row selection state", () => {
    const display = [makeDisplayRow({ id: "1" }), makeDisplayRow({ id: "2" })];
    expect(archiveConfirmationText(1)).toBe("ARCHIVE 1 PIECE");
    expect(archiveConfirmationText(3)).toBe("ARCHIVE 3 PIECES");
    expect(allRowsSelected(display, new Set(["1", "2"]))).toBe(true);
    expect(allRowsSelected(display, new Set(["1"]))).toBe(false);
  });

  it("returns null impact without a matching selection", () => {
    const emptySnapshot: PieceImpactSnapshotLike = {
      pieces: [],
      pieceDrawings: [],
      commentDispositions: [],
      drawings: [],
      drawingSets: [],
      submittals: [],
      sheetResponses: [],
      drawingRevisions: [],
      drawingReviews: [],
      drawingSignoffs: [],
    };
    expect(buildSelectedPieceImpact(null, null)).toBeNull();
    expect(buildSelectedPieceImpact("p1", emptySnapshot)).toBeNull();
  });

  it("builds a typed impact model for the selected piece", () => {
    const snapshot: PieceImpactSnapshotLike = {
      pieces: [
        makePiece({
          id: "p1",
          piece_mark: "B12",
          normalized_piece_mark: "B12",
          lifecycle_status: "released",
        }),
      ],
      pieceDrawings: [],
      commentDispositions: [],
      drawings: [],
      drawingSets: [],
      submittals: [],
      sheetResponses: [],
      drawingRevisions: [],
      drawingReviews: [],
      drawingSignoffs: [],
    };
    expect(buildSelectedPieceImpact("p1", snapshot)).toMatchObject({
      pieceId: "p1",
      pieceMark: "B12",
      lifecycleStatus: "released",
      onHold: false,
      releaseReady: false,
    });
  });
});

describe("IMPORT_DECISION_TONE", () => {
  it("maps decisions to pill tones", () => {
    expect(IMPORT_DECISION_TONE.new).toBe("good");
    expect(IMPORT_DECISION_TONE.conflict).toBe("danger");
    expect(IMPORT_DECISION_TONE.unchanged).toBe("neutral");
  });
});

describe("piece register view + empty filters", () => {
  it("defaults view and empty filters", () => {
    expect(resolvePieceRegisterView("board")).toBe("board");
    expect(resolvePieceRegisterView("nope")).toBe("overview");
    expect(EMPTY_PIECE_REGISTER_FILTERS.hold).toBe("all");
    expect(PIECE_REGISTER_VIEW_IDS).toContain("impact");
    expect(PIECE_REGISTER_VIEW_IDS).toContain("register");
    expect(PIECE_REGISTER_VIEW_LABELS.impact).toBe("Revision Impact");
    expect(PIECE_REGISTER_VIEW_LABELS.register).toBe("Register");
  });
});
