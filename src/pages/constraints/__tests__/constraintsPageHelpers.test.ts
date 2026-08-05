import { describe, expect, it } from "vitest";
import {
  mergeConstraints,
  computeConstraintKpis,
  filterAndSortConstraints,
} from "../constraintsPageHelpers";

describe("constraintsPageHelpers", () => {
  it("merges generated + stored constraints", () => {
    expect(mergeConstraints([{ id: "g" }], [{ id: "s" }]).map((c) => c.id)).toEqual(["g", "s"]);
  });

  it("computes kpis", () => {
    const all = [
      { status: "Open", priority: "Critical", constraint_type: "Other", created_date: "2026-01-01" },
      { status: "Resolved", priority: "Low", constraint_type: "Other" },
      {
        status: "Open",
        priority: "Medium",
        constraint_type: "IFC Hold",
        due_date: "2020-01-01",
      },
    ];
    const kpis = computeConstraintKpis(all, Date.parse("2026-06-01T00:00:00Z"));
    expect(kpis.open).toHaveLength(2);
    expect(kpis.resolved).toHaveLength(1);
    expect(kpis.overdue.length).toBeGreaterThanOrEqual(1);
    expect(kpis.critical).toHaveLength(1);
    expect(kpis.total).toBe(3);
  });

  it("filters and sorts constraints", () => {
    const all = [
      { status: "Resolved", priority: "Low", constraint_type: "Other", title: "done" },
      { status: "Open", priority: "Critical", constraint_type: "IFC Hold", title: "ifc block", due_date: "2026-07-01" },
      { status: "Open", priority: "Medium", constraint_type: "Other", title: "misc", due_date: "2026-06-01" },
    ];
    const filtered = filterAndSortConstraints(all, {
      filterType: "all",
      filterStatus: "open",
      filterPriority: "all",
      search: "",
      seqFilter: null,
      matchesSequenceFilter: () => true,
    });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].priority).toBe("Critical");

    const bySearch = filterAndSortConstraints(all, {
      filterType: "all",
      filterStatus: "all",
      filterPriority: "all",
      search: "ifc",
      seqFilter: null,
      matchesSequenceFilter: () => true,
    });
    expect(bySearch).toHaveLength(1);
    expect(bySearch[0].title).toBe("ifc block");
  });
});

import { CONSTRAINTS_COMMAND_SUBTITLE } from "../constraintsPageHelpers";

describe("constraints command subtitle", () => {
  it("exposes stable shell subtitle", () => {
    expect(CONSTRAINTS_COMMAND_SUBTITLE).toContain("upstream blockers");
  });
});
