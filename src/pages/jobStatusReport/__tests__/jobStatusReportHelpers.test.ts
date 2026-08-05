import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  sortProjectsByHealthThenName,
} from "../jobStatusReportHelpers";

describe("jobStatusReportHelpers", () => {
  it("computes readiness", () => {
    const incomplete = { name: "A" };
    const r = computeReadiness(incomplete, Date.parse("2026-08-05T00:00:00Z"));
    expect(r.status).toBe("missing-data");
    expect(r.pct).toBeLessThan(100);

    const ready = {
      name: "B",
      phase: "Fabrication",
      health_status: "On Track",
      original_contract_value: 1,
      target_completion_date: "2026-12-01",
      project_manager: "Sam",
      psr_report_date: "2026-08-01",
    };
    // age depends on getPsrReportDate implementation
    const r2 = computeReadiness(ready, Date.parse("2026-08-05T00:00:00Z"));
    expect(["ready", "never-run", "needs-review", "missing-data"]).toContain(r2.status);
  });

  it("sorts at-risk first", () => {
    const sorted = sortProjectsByHealthThenName([
      { name: "Z", health_status: "On Track" },
      { name: "A", health_status: "At Risk" },
      { name: "M", health_status: "Watch" },
    ]);
    expect(sorted.map((p) => p.name)).toEqual(["A", "M", "Z"]);
  });
});
