import { describe, expect, it } from "vitest";
import { filterChangeRequests, computeChangeRequestStats } from "../changeRequestsPageHelpers";

describe("changeRequestsPageHelpers", () => {
  it("filters and stats", () => {
    const rows = [
      { status: "Submitted", priority: "High", estimated_cost_impact: 100 },
      { status: "Approved", priority: "Low", estimated_cost_impact: 50 },
      { status: "Rejected", priority: "High", estimated_cost_impact: 0 },
    ];
    expect(filterChangeRequests(rows, { filterStatus: "High" as any, filterPriority: "High" })).toHaveLength(0);
    expect(filterChangeRequests(rows, { filterStatus: "all", filterPriority: "High" })).toHaveLength(2);
    const stats = computeChangeRequestStats(rows, {
      SUBMITTED: "Submitted",
      APPROVED: "Approved",
      REJECTED: "Rejected",
    });
    expect(stats).toEqual({ total: 3, submitted: 1, approved: 1, rejected: 1, totalCostImpact: 150 });
  });
});

import {
  CHANGE_REQUEST_STATUS_FILTERS,
  CHANGE_REQUEST_PRIORITY_FILTERS,
  changeRequestCommandSubtitle,
  createEmptyChangeRequestFilters,
  nextFilterToggle,
} from "../changeRequestsPageHelpers";

describe("change request catalogs and filters", () => {
  it("exposes status/priority catalogs and subtitle", () => {
    expect(CHANGE_REQUEST_STATUS_FILTERS.length).toBeGreaterThan(0);
    expect(CHANGE_REQUEST_PRIORITY_FILTERS.length).toBeGreaterThan(0);
    expect(changeRequestCommandSubtitle({ submitted: 2, approved: 1 })).toBe(
      "2 submitted · 1 approved · pre-CO formal request tracking",
    );
    expect(createEmptyChangeRequestFilters()).toEqual({
      filterStatus: "all",
      filterPriority: "all",
    });
    expect(nextFilterToggle("Submitted", "Submitted")).toBe("all");
  });
});
