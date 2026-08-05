import { describe, expect, it } from "vitest";
import {
  buildPortfolioTrackerRows,
  filterPortfolioTrackerRows,
} from "../portfolioTrackerHelpers";
import {
  bucketProjectsByHealth,
  projectsHealthSubtitle,
} from "../projectsHealthHelpers";

describe("portfolio tracker + health helpers", () => {
  it("builds and filters tracker rows", () => {
    const rows = buildPortfolioTrackerRows({
      projects: [
        {
          id: "p1",
          name: "Alpha",
          project_number: "A1",
          general_contractor: "GC",
          phase: "Fab",
          health_status: "On Track",
          job_type: "Industrial",
          original_contract_value: 1000,
        },
      ],
      workPackages: [
        { project_id: "p1", percent_complete: 40 },
        { project_id: "p1", percent_complete: 60 },
      ],
      expenses: [
        { project_id: "p1", payment_status: "Paid", amount: 100 },
        { project_id: "p1", payment_status: "Voided", amount: 999 },
      ],
    });
    expect(rows[0].pctComplete).toBe(50);
    expect(rows[0].committed).toBe(100);
    expect(filterPortfolioTrackerRows(rows, { search: "alp" })).toHaveLength(1);
    expect(filterPortfolioTrackerRows(rows, { phaseFilter: "Detailing" })).toHaveLength(0);
  });

  it("buckets projects by health", () => {
    const buckets = bucketProjectsByHealth([
      { id: "1", name: "B", health_status: "On Track" },
      { id: "2", name: "A", health_status: "At Risk" },
      { id: "3", name: "C", health_status: "On Hold" },
    ]);
    expect(buckets["On Track"]).toHaveLength(1);
    expect(buckets["At Risk"][0].name).toBe("A");
    expect(buckets.Unknown).toHaveLength(1);
    expect(projectsHealthSubtitle(buckets)).toContain("1 on track");
  });
});
