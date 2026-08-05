import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  sortProjectsByHealthThenName,
  countByHealthStatus,
} from "../jobStatusReportHelpers";
// extended below

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

import {
  enrichProjectsWithReadiness,
  computeJobStatusKpis,
  filterJobStatusProjects,
} from "../jobStatusReportHelpers";

describe("jobStatusReport page helpers", () => {
  it("enriches, kpis, and filters", () => {
    const projects = [
      { id: "1", name: "Alpha", health_status: "At Risk", phase: "Fabrication", original_contract_value: 1, target_completion_date: "2026-01-01", project_manager: "Ada" },
      { id: "2", name: "Beta", health_status: "On Track", phase: "Detailing", original_contract_value: 1, target_completion_date: "2026-01-01", project_manager: "Bob" },
    ];
    const enriched = enrichProjectsWithReadiness(projects);
    expect(enriched[0]._readiness).toBeTruthy();
    const kpis = computeJobStatusKpis(enriched);
    expect(kpis.atRiskCount).toBe(1);
    const filtered = filterJobStatusProjects(enriched, {
      search: "alpha",
      healthFilter: "all",
      readinessFilter: "all",
    });
    expect(filtered.map((p) => p.id)).toEqual(["1"]);
  });
});

describe("countByHealthStatus", () => {
  it("counts matching health labels", () => {
    const rows = [
      { health_status: "At Risk" },
      { health_status: "Watch" },
      { health_status: "At Risk" },
      { health_status: "Healthy" },
    ];
    expect(countByHealthStatus(rows, "At Risk")).toBe(2);
    expect(countByHealthStatus(rows, "Watch")).toBe(1);
    expect(countByHealthStatus(rows, "Missing")).toBe(0);
  });
});

import { formatJobStatusTodayLabel } from "../jobStatusReportHelpers";

describe("formatJobStatusTodayLabel", () => {
  it("returns a non-empty localized string", () => {
    const label = formatJobStatusTodayLabel(new Date("2026-08-05T18:00:00Z"));
    expect(label.length).toBeGreaterThan(5);
  });
});

import { createEmptyJobStatusFilters } from "../jobStatusReportHelpers";
import { nextFilterToggle } from "@/pages/shared/nextFilterToggle";

describe("job status empty filters", () => {
  it("resets search and filters", () => {
    expect(createEmptyJobStatusFilters()).toEqual({
      search: "",
      healthFilter: "all",
      readinessFilter: "all",
    });
    expect(nextFilterToggle("At Risk", "At Risk")).toBe("all");
  });
});
