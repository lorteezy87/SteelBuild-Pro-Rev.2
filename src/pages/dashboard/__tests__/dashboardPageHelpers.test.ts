import { describe, expect, it } from "vitest";
import {
  filterPortfolioProjects,
  buildLiveProjectIdSet,
  scopePortfolioRows,
  filterRowsByProjectId,
  filterRowsByLiveProjectIds,
} from "../dashboardPageHelpers";

describe("dashboardPageHelpers", () => {
  it("portfolio projects and id set", () => {
    const projects = [
      { id: "a", on_hold: false },
      { id: "b", on_hold: true },
      { id: null, on_hold: false },
    ];
    expect(filterPortfolioProjects(projects).map((p) => p.id)).toEqual(["a", null]);
    expect([...buildLiveProjectIdSet([{ id: "a" }, { id: "b" }, { id: null }])]).toEqual(["a", "b"]);
  });

  it("scopes rows", () => {
    const rows = [
      { id: 1, project_id: "a" },
      { id: 2, project_id: "b" },
      { id: 3, project_id: "c" },
    ];
    const live = new Set(["a", "c"]);
    expect(scopePortfolioRows(rows, { projectId: "x", liveProjectIds: live })).toHaveLength(3);
    expect(scopePortfolioRows(rows, { projectId: null, liveProjectIds: live }).map((r) => r.id)).toEqual([1, 3]);
    expect(filterRowsByProjectId(rows, "b").map((r) => r.id)).toEqual([2]);
    expect(filterRowsByProjectId(rows, null)).toEqual([]);
    expect(filterRowsByLiveProjectIds(rows, live).map((r) => r.id)).toEqual([1, 3]);
  });
});
