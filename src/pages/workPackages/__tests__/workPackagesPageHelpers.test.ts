import { describe, expect, it } from "vitest";
import {
  filterWorkPackages,
  filterSelectedRows,
  nextSelectedIdsToggle,
  resolveProjectPercentComplete,
  formatWpNumber,
} from "../workPackagesPageHelpers";

describe("workPackagesPageHelpers", () => {
  const rows = [
    {
      id: "1",
      wp_number: "WP-001",
      name: "Anchors",
      phase: "Fabrication",
      status: "In Progress",
      notes: "",
      _signals: { phase: "Fabrication", status: "In Progress", risk: "clear" },
    },
    {
      id: "2",
      wp_number: "WP-002",
      name: "Columns",
      phase: "Erection",
      status: "Not Started",
      notes: "hold",
      _signals: { phase: "Erection", status: "Not Started", risk: "high" },
    },
  ] as any;

  it("filters by phase/risk/search", () => {
    const byPhase = filterWorkPackages(rows, {
      phaseFilter: "Fabrication",
      statusFilter: "all",
      riskFilter: "all",
      search: "",
      seqFilter: null,
      matchesSequenceFilter: () => true,
      sortFn: () => 0,
    });
    expect(byPhase.map((r) => r.id)).toEqual(["1"]);

    const bySearch = filterWorkPackages(rows, {
      phaseFilter: "all",
      statusFilter: "all",
      riskFilter: "all",
      search: "columns",
      seqFilter: null,
      matchesSequenceFilter: () => true,
      sortFn: () => 0,
    });
    expect(bySearch.map((r) => r.id)).toEqual(["2"]);
  });

  it("selection and project % helpers", () => {
    expect(filterSelectedRows(rows, new Set(["2"]))).toHaveLength(1);
    expect([...nextSelectedIdsToggle(new Set(["1"]), "1")]).toEqual([]);
    expect(formatWpNumber(7)).toBe("WP-007");
    expect(
      resolveProjectPercentComplete({ scope_complete_pct_override: 42 }, [], () => ({ pct: 10 })),
    ).toBe(42);
    expect(
      resolveProjectPercentComplete(null, rows, () => ({ pct: 55 })),
    ).toBe(55);
    expect(
      resolveProjectPercentComplete(null, [], () => ({ pct: 55 })),
    ).toBeNull();
  });
});
