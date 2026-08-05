import { describe, expect, it } from "vitest";
import {
  buildWpLabelById,
  groupLookAheadItems,
  computeLookAheadStats,
} from "../lookAheadScheduleHelpers";

describe("lookAheadScheduleHelpers", () => {
  it("builds wp labels", () => {
    expect(buildWpLabelById([{ id: "1", wp_number: "WP-1", name: "Anchors" }])["1"]).toBe("WP-1");
  });

  it("groups by phase/project/crew", () => {
    const items = [
      { phase: "Detailing", project_name: "A", crew: "C1" },
      { phase: "Erection", project_name: "A", crew: "C2" },
      { phase: "Erection", project_name: "B", crew: null },
    ];
    const byPhase = groupLookAheadItems(items, "Phase");
    expect(byPhase.groupKeys).toEqual(["Detailing", "Fabrication", "Delivery", "Erection"]);
    expect(byPhase.itemsByGroup.get("Erection")).toHaveLength(2);

    const byCrew = groupLookAheadItems(items, "Crew");
    expect(byCrew.itemsByGroup.get("No Crew")).toHaveLength(1);
  });

  it("computes stats", () => {
    const stats = computeLookAheadStats([
      { status: "In Progress", percent_complete: 50 },
      { status: "Complete", percent_complete: 100 },
      { status: "Delayed", percent_complete: 10 },
    ]);
    expect(stats).toEqual({ total: 3, inProgress: 1, complete: 1, delayed: 1, avgProgress: 53 });
  });
});
