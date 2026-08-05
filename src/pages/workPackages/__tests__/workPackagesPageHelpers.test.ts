import { describe, expect, it } from "vitest";
import {
  filterWorkPackages,
  filterSelectedRows,
  nextSelectedIdsToggle,
  resolveProjectPercentComplete,
  formatWpNumber,
  buildLiveProjectIdSet,
  scopeWorkPackagesForPage,
  sortWorkPackagesByProjectName,
  WP_PHASE_FILTERS,
  WP_STATUS_FILTERS,
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

  it("scopes work packages by live projects", () => {
    const live = buildLiveProjectIdSet([{ id: "p1" }, { id: null as any }, { id: "p2" }]);
    expect([...live].sort()).toEqual(["p1", "p2"]);
    const raw = [
      { id: "w1", project_id: "p1" },
      { id: "w2", project_id: "gone" },
      { id: "w3", project_id: "p2" },
    ];
    expect(scopeWorkPackagesForPage(raw, { projectId: null, selectedProject: null, liveProjectIds: live }).map((w) => w.id)).toEqual(["w1", "w3"]);
    expect(scopeWorkPackagesForPage(raw, { projectId: "p1", selectedProject: { id: "p1" }, liveProjectIds: live })).toEqual(raw);
    expect(scopeWorkPackagesForPage(raw, { projectId: "p1", selectedProject: null, liveProjectIds: live })).toEqual([]);
  });
describe("sortWorkPackagesByProjectName", () => {
  it("sorts by project_name", () => {
    const sorted = sortWorkPackagesByProjectName([
      { project_name: "Zeta" },
      { project_name: "Alpha" },
    ]);
    expect(sorted.map((r) => r.project_name)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("WP phase/status filters", () => {
  it("includes Detailing and On Hold", () => {
    expect(WP_PHASE_FILTERS).toContain("Detailing");
    expect(WP_STATUS_FILTERS).toContain("On Hold");
  });
});
