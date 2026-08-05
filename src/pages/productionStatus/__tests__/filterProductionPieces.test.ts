import { describe, expect, it } from "vitest";
import { filterProductionPieces } from "../productionStatusPageHelpers";

describe("filterProductionPieces", () => {
  const pieces = [
    { status: "Fabricated", piece_mark: "B1", assembly_mark: "A1", erection_area: "Grid 1", sequence_number: "10" },
    { status: "Shipped", piece_mark: "C2", assembly_mark: "A2", erection_area: "Grid 2", sequence_number: "20" },
  ];
  it("filters stage and search", () => {
    expect(filterProductionPieces(pieces, { stageFilter: "Fabricated" })).toHaveLength(1);
    expect(filterProductionPieces(pieces, { search: "grid 2" })).toHaveLength(1);
    expect(filterProductionPieces(pieces, { stageFilter: "All" })).toHaveLength(2);
  });
});
