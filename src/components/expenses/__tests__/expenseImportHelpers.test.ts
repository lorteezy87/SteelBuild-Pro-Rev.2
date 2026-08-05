import { describe, expect, it } from "vitest";
import {
  parseCSV,
  buildTemplateCSV,
  parseRowsToExpenses,
  coerceDate,
  coerceNumber,
} from "../expenseImportHelpers";

describe("parseCSV", () => {
  it("handles quoted commas", () => {
    const rows = parseCSV('a,"b,c",d\n1,"2,3",4');
    expect(rows[0]).toEqual(["a", "b,c", "d"]);
    expect(rows[1]).toEqual(["1", "2,3", "4"]);
  });
});

describe("coerce helpers", () => {
  it("coerces dates and numbers", () => {
    expect(coerceDate("2026-04-01")).toBeTruthy();
    expect(coerceNumber("$1,200.50")).toBeCloseTo(1200.5);
  });
});

describe("parseRowsToExpenses", () => {
  it("validates required fields and maps headers", () => {
    const csv = parseCSV(
      "Date,Description,Cost Code,Amount\n2026-04-01,Beams,05,1000\n,Missing,,",
    );
    const { records } = parseRowsToExpenses(csv, []);
    expect(records[0]._errors).toEqual([]);
    expect(records[0].amount).toBe(1000);
    expect(records[1]._errors.length).toBeGreaterThan(0);
  });
});

describe("buildTemplateCSV", () => {
  it("includes header row", () => {
    const csv = buildTemplateCSV();
    expect(csv.split("\n")[0]).toContain("Date");
    expect(csv.split("\n").length).toBeGreaterThan(1);
  });
});
