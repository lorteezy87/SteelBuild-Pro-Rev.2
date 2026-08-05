import { describe, expect, it } from "vitest";
import {
  buildProductionStatusCsvRows,
  buildProductionStatusCsvString,
  PRODUCTION_STATUS_CSV_HEADERS,
  filterProductionPieces,
  computeDrawingCoverage,
} from "../productionStatusPageHelpers";

describe("productionStatusPageHelpers", () => {
  it("builds CSV rows and string", () => {
    const rows = buildProductionStatusCsvRows([
      { piece_mark: "B1", assembly_mark: "A", status: "Fabricated", percent_complete: 100 },
    ]);
    expect(rows[0][0]).toBe("B1");
    expect(rows[0][4]).toBe("Fabricated");
    const csv = buildProductionStatusCsvString([
      { piece_mark: 'X"Y', status: "Open" },
    ]);
    expect(csv.split("\n")[0]).toContain(PRODUCTION_STATUS_CSV_HEADERS[0]);
    expect(csv).toContain('"X""Y"');
  });
});

describe("filterProductionPieces / computeDrawingCoverage", () => {
  const pieces = [
    { piece_mark: "B1", assembly_mark: "A", status: "Fabricated", erection_area: "N", sequence_number: "1" },
    { piece_mark: "B2", assembly_mark: "B", status: "Shipped", erection_area: "S", sequence_number: "2" },
  ];

  it("filters by stage and search", () => {
    expect(filterProductionPieces(pieces, { stageFilter: "Shipped" }).map((p) => p.piece_mark)).toEqual(["B2"]);
    expect(filterProductionPieces(pieces, { search: "grid" })).toEqual([]);
    expect(filterProductionPieces(pieces, { search: "b1" }).map((p) => p.piece_mark)).toEqual(["B1"]);
  });

  it("computes drawing coverage", () => {
    const map = new Map([["b1", true]]);
    const norm = (m: string | null | undefined) => String(m || "").toLowerCase();
    expect(computeDrawingCoverage(pieces, map, norm)).toEqual({ total: 2, linked: 1, pct: 50 });
    expect(computeDrawingCoverage([], map, norm)).toEqual({ total: 0, linked: 0, pct: 0 });
  });
});
