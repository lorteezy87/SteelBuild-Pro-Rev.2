import { describe, expect, it } from "vitest";
import { buildExecutiveDistributions } from "../executiveChartData";

describe("executive chart category colors", () => {
  it("keeps an all-at-risk portfolio red when healthy categories are absent", () => {
    const { health } = buildExecutiveDistributions([{ health_status: "At Risk" }], []);
    expect(health).toEqual([{ name: "At Risk", value: 1, color: "var(--status-error)" }]);
  });

  it("keeps sparse severity categories attached to their own tones", () => {
    const { severity } = buildExecutiveDistributions([], [
      { priority: "Medium" }, { priority: "Low" }, { priority: "Low" },
    ]);
    expect(severity).toEqual([
      { name: "Medium", value: 1, color: "var(--status-info)" },
      { name: "Low", value: 2, color: "var(--text-muted)" },
    ]);
  });

  it("does not fabricate chart slices for unknown or empty data", () => {
    expect(buildExecutiveDistributions([{ health_status: null }], [{ priority: null }]))
      .toEqual({ health: [], severity: [] });
  });
});
