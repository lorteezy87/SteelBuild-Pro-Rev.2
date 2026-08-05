import { describe, expect, it } from "vitest";
import { sortAgingReportRows } from "../agingReportHelpers";

describe("sortAgingReportRows", () => {
  const rows = [
    { number: "S-2", daysStuck: 3 },
    { number: "S-1", daysStuck: 10 },
  ];
  it("sorts numeric and string columns", () => {
    expect(sortAgingReportRows(rows, "daysStuck", "desc").map((r) => r.daysStuck)).toEqual([10, 3]);
    expect(sortAgingReportRows(rows, "number", "asc").map((r) => r.number)).toEqual(["S-1", "S-2"]);
  });
});
