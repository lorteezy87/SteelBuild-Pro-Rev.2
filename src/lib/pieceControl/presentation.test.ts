import { describe, expect, it } from "vitest";
import {
  buildPieceControlShadowComparison,
  buildPieceControlSummary,
  modePresentation,
  normalizePieceControlMode,
  type PieceSummaryRow,
} from "./presentation";
import type { CanonicalRollupPiece } from "./canonicalRollups";

let rowSequence = 0;

const row = (
  overrides: Partial<PieceSummaryRow> = {},
): PieceSummaryRow => ({
  id: `piece-${++rowSequence}`,
  parent_piece_id: null,
  is_container: false,
  is_deleted: false,
  deleted_at: null,
  quantity: 1,
  weight_each_lbs: 1000,
  weight_total_lbs: null,
  lifecycle_status: "not_started",
  on_hold: false,
  work_package_id: "wp-1",
  ...overrides,
});

const canonicalRow = (
  overrides: Partial<CanonicalRollupPiece> = {},
): CanonicalRollupPiece => {
  const summaryRow = row(overrides);
  return {
    ...summaryRow,
    project_id: overrides.project_id ?? "project-1",
    current_station: overrides.current_station ?? null,
    is_container: summaryRow.is_container ?? false,
    is_deleted: summaryRow.is_deleted ?? false,
  };
};

describe("modePresentation", () => {
  it("uses operational authority language for shadow mode", () => {
    expect(modePresentation("shadow")).toEqual({
      label: "Shadow review",
      tone: "warn",
      authority: "Existing production records remain authoritative while the register is compared.",
    });
  });

  it("normalizes unknown and missing modes to off", () => {
    expect(normalizePieceControlMode("pilot")).toBe("pilot");
    expect(normalizePieceControlMode("unexpected")).toBe("off");
    expect(normalizePieceControlMode(null)).toBe("off");
  });
});

describe("buildPieceControlSummary", () => {
  it("derives quantity, tonnage, lifecycle, and attention counts", () => {
    const summary = buildPieceControlSummary([
      row({ quantity: 2, lifecycle_status: "in_fabrication" }),
      row({
        quantity: 3,
        lifecycle_status: "fabricated",
        weight_each_lbs: null,
        on_hold: true,
        work_package_id: null,
      }),
    ]);

    expect(summary.totalPieces).toBe(5);
    expect(summary.knownTons).toBe(1);
    expect(summary.inFabricationPieces).toBe(2);
    expect(summary.readyToShipPieces).toBe(3);
    expect(summary.unknownWeightPieces).toBe(3);
    expect(summary.heldRows).toBe(1);
    expect(summary.unassignedRows).toBe(1);
    expect(summary.attention.map((item) => [item.key, item.count])).toEqual([
      ["unassigned", 1],
      ["missing-weight", 3],
      ["held", 1],
    ]);
  });

  it("includes released in the lifecycle strip", () => {
    const summary = buildPieceControlSummary([
      row({ lifecycle_status: "released", quantity: 4 }),
    ]);
    expect(summary.lifecycle.find((item) => item.key === "released")?.pieces).toBe(4);
  });

  it("excludes containers, deleted rows, and active split parents", () => {
    const parent = row({ id: "parent", quantity: 100 });
    const summary = buildPieceControlSummary([
      parent,
      row({ id: "child", parent_piece_id: parent.id, quantity: 2 }),
      row({ is_container: true, quantity: 50 }),
      row({ is_deleted: true, quantity: 10 }),
      row({ quantity: 3 }),
    ]);

    expect(summary.rowCount).toBe(2);
    expect(summary.totalPieces).toBe(5);
  });
});

describe("buildPieceControlShadowComparison", () => {
  it("compares actionable canonical pieces with legacy production", () => {
    expect(
      buildPieceControlShadowComparison(
        [
          canonicalRow({ id: "parent", quantity: 100 }),
          canonicalRow({ id: "child", parent_piece_id: "parent", quantity: 3 }),
        ],
        [{ quantity: 1, weight: 100 }],
      ),
    ).toEqual({ pieceDelta: 2, tonsDelta: 1.45 });
  });

  it("treats missing or zero legacy quantity as one for tonnage only", () => {
    const canonical = canonicalRow({ quantity: 2, weight_each_lbs: 200 });

    expect(
      buildPieceControlShadowComparison(
        [canonical],
        [
          { quantity: 0, weight: 100 },
          { quantity: null, weight: 100 },
          { quantity: 4, weight: null },
        ],
      ),
    ).toEqual({ pieceDelta: -2, tonsDelta: 0.1 });
  });
});
