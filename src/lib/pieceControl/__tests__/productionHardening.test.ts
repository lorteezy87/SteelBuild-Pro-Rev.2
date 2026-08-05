import { describe, expect, it } from "vitest";
import { aggregatePieceRowsByMark } from "../aggregateImportRows";
import { parseKissPieceRows } from "../importAdapters";
import { resolveCanonicalShipTargets } from "../shippingCanonicalBridge";

describe("aggregatePieceRowsByMark", () => {
  it("sums quantities for exact piece marks and never invents marks", () => {
    const rows = aggregatePieceRowsByMark([
      { piece_mark: "B1", quantity: 2, weight_total_lbs: 200 },
      { piece_mark: "b1", quantity: 3, weight_total_lbs: 300 },
      { piece_mark: "", quantity: 9 },
      { assembly_mark: "C2", quantity: 1 },
    ]);
    expect(rows).toHaveLength(2);
    const b1 = rows.find((row) => String(row.piece_mark).toUpperCase() === "B1");
    expect(b1?.quantity).toBe(5);
    expect(b1?.weight_total_lbs).toBe(500);
  });
});

describe("parseKissPieceRows", () => {
  it("parses CSV KISS exports with mark headers", () => {
    const rows = parseKissPieceRows("Mark,Qty,Shape,Grade\nB-10,4,W12X26,A992\n");
    expect(rows).toEqual([
      {
        piece_mark: "B-10",
        quantity: "4",
        profile: "W12X26",
        material_grade: "A992",
      },
    ]);
  });

  it("parses MEMBER banner lines without guessing invalid marks", () => {
    const rows = parseKissPieceRows("MEMBER\nC1 2 W10X12 A992 120 400\nEND_MEMBER\n");
    expect(rows[0]).toMatchObject({
      piece_mark: "C1",
      quantity: 2,
      profile: "W10X12",
      material_grade: "A992",
    });
  });
});

describe("resolveCanonicalShipTargets", () => {
  it("ships only fabricated leaf lots with exact mark matches", () => {
    const result = resolveCanonicalShipTargets(
      [{ pieces: [{ mark: "B1" }, { mark: "B2" }, { mark: "B3" }] }],
      [
        {
          id: "1",
          piece_mark: "B1",
          lifecycle_status: "fabricated",
          on_hold: false,
        },
        {
          id: "2",
          piece_mark: "B2",
          lifecycle_status: "in_fabrication",
          on_hold: false,
        },
        {
          id: "3",
          piece_mark: "B3",
          lifecycle_status: "fabricated",
          on_hold: true,
        },
      ],
    );
    expect(result.shipIds).toEqual(["1"]);
    expect(result.skipped.map((row) => row.mark).sort()).toEqual(["B2", "B3"]);
  });

  it("rejects ambiguous same-mark leaf lots instead of guessing", () => {
    const result = resolveCanonicalShipTargets(
      [{ pieces: [{ mark: "B1" }] }],
      [
        {
          id: "1",
          piece_mark: "B1",
          lifecycle_status: "fabricated",
          on_hold: false,
          parent_piece_id: "parent",
        },
        {
          id: "2",
          piece_mark: "B1",
          lifecycle_status: "fabricated",
          on_hold: false,
          parent_piece_id: "parent",
        },
      ],
    );
    expect(result.shipIds).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/Ambiguous/i);
  });
});
