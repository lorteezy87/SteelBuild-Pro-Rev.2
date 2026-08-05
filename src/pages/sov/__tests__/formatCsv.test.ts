import { describe, expect, it } from "vitest";
import { buildSovCsvString, buildSovCsvRows, SOV_CSV_HEADERS } from "../format";

describe("SOV CSV string", () => {
  it("includes headers", () => {
    const rows = buildSovCsvRows([], () => ({}));
    const csv = buildSovCsvString(rows);
    expect(csv.split("\n")[0]).toContain(SOV_CSV_HEADERS[0]);
  });
});
