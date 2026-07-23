import { describe, expect, it } from "vitest";
import {
  buildPieceControlSummary,
  modePresentation,
  type PieceSummaryRow,
} from "./presentation";

const row = (
  overrides: Partial<PieceSummaryRow> = {},
): PieceSummaryRow => ({
  quantity: 1,
  weight_each_lbs: 1000,
  weight_total_lbs: null,
  lifecycle_status: "not_started",
  on_hold: false,
  work_package_id: "wp-1",
  ...overrides,
});

describe("modePresentation", () => {
  it("uses operational authority language for shadow mode", () => {
    expect(modePresentation("shadow")).toEqual({
      label: "Shadow review",
      tone: "warn",
      authority: "Existing production records remain authoritative while the register is compared.",
    });
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
});
