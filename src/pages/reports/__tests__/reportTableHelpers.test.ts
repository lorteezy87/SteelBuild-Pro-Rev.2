import { describe, expect, it } from "vitest";
import { sortReportTableRows } from "../reportTableHelpers";

describe("sortReportTableRows", () => {
  const cols = [
    { key: "name" },
    { key: "amt", sortValue: (r: any) => r.amt },
  ];
  const rows = [
    { name: "Beta", amt: 2 },
    { name: "Alpha", amt: null },
    { name: "Charlie", amt: 1 },
  ];

  it("returns rows unchanged without sortKey", () => {
    expect(sortReportTableRows(rows, cols, null)).toEqual(rows);
  });

  it("sorts asc/desc with nulls last", () => {
    expect(sortReportTableRows(rows, cols, "name", "asc").map((r) => r.name)).toEqual([
      "Alpha",
      "Beta",
      "Charlie",
    ]);
    expect(sortReportTableRows(rows, cols, "amt", "asc").map((r) => r.name)).toEqual([
      "Charlie",
      "Beta",
      "Alpha",
    ]);
    expect(sortReportTableRows(rows, cols, "amt", "desc").map((r) => r.amt)).toEqual([2, 1, null]);
  });
});
