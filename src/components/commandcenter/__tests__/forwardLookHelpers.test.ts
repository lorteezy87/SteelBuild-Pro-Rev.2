import { describe, expect, it } from "vitest";
import { buildForwardLookData, LOOK_AHEAD_DAYS } from "../forwardLookHelpers";

describe("buildForwardLookData", () => {
  it("collects erection in-progress items", () => {
    const data = buildForwardLookData({
      workPackages: [
        {
          id: "2",
          phase: "Erection",
          status: "In Progress",
          wp_number: "WP-2",
          name: "Bay",
          project_id: "p1",
          percent_complete: 20,
        },
      ],
      deliveries: [],
      projectMap: { p1: { project_number: "P-100" } },
    });
    expect(data.erectionItems).toHaveLength(1);
    expect(data.erectionItems[0].projectNum).toBe("P-100");
    expect(LOOK_AHEAD_DAYS).toBe(14);
  });

  it("excludes completed work packages from fab/erection lists", () => {
    const data = buildForwardLookData({
      workPackages: [
        { id: "1", phase: "Detailing", status: "Complete", project_id: "p1" },
        { id: "2", phase: "Erection", status: "Complete", project_id: "p1" },
      ],
      deliveries: [],
      projectMap: {},
    });
    expect(data.fabReleases).toEqual([]);
    expect(data.erectionItems).toEqual([]);
  });
});
