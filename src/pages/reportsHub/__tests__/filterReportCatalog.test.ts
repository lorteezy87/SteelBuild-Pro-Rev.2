import { describe, expect, it } from "vitest";
import { filterReportCatalog } from "../reportsHubControlCenter.derive";

describe("filterReportCatalog", () => {
  const reports = [
    { title: "Revenue", summary: "Cash", category: "Finance" },
    { title: "Risks", summary: "Open items", category: "Risk" },
  ];
  it("filters by category and search", () => {
    expect(filterReportCatalog(reports, { categoryFilter: "Finance" })).toHaveLength(1);
    expect(filterReportCatalog(reports, { search: "open" })).toHaveLength(1);
    expect(filterReportCatalog(reports, { categoryFilter: "All", search: "" })).toHaveLength(2);
  });
});
