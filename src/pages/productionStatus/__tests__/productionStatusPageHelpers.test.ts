import { describe, expect, it } from "vitest";
import {
  buildProductionStatusCsvRows,
  buildProductionStatusCsvString,
  PRODUCTION_STATUS_CSV_HEADERS,
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
