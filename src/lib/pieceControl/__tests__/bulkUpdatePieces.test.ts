import { describe, expect, it } from "vitest";
import { planBulkPieceAttributeUpdate } from "../bulkUpdatePieces";

describe("planBulkPieceAttributeUpdate", () => {
  it("only includes checked fields and clears blanks to null", () => {
    expect(
      planBulkPieceAttributeUpdate({
        updateSequence: true,
        updateArea: true,
        sequenceNumber: " 22 ",
        erectionArea: "   ",
      }),
    ).toEqual({
      patch: { sequence_number: "22", erection_area: null },
      fields: ["sequence_number", "erection_area"],
    });
  });

  it("returns an empty plan when nothing is checked", () => {
    expect(
      planBulkPieceAttributeUpdate({
        updateSequence: false,
        updateArea: false,
        sequenceNumber: "22",
        erectionArea: "Area A",
      }),
    ).toEqual({ patch: {}, fields: [] });
  });
});
