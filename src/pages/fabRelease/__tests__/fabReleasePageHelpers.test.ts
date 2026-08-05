import { describe, expect, it } from "vitest";
import {
  groupByWorkPackageId,
  groupSubmittalsByDrawingSetId,
  groupByLane,
  groupByStatusOrder,
} from "../fabReleasePageHelpers";

describe("fabReleasePageHelpers", () => {
  it("groups by work package id", () => {
    const map = groupByWorkPackageId([
      { id: "1", work_package_id: "w1" },
      { id: "2", work_package_id: "w1" },
      { id: "3", work_package_id: null },
    ]);
    expect(map.get("w1")).toHaveLength(2);
    expect(map.has("")).toBe(false);
  });

  it("groups submittals by drawing set ids", () => {
    const map = groupSubmittalsByDrawingSetId([
      { id: "s1", drawing_set_ids: ["d1", "d2"] },
      { id: "s2", drawing_set_ids: ["d1"] },
    ]);
    expect(map.get("d1")).toHaveLength(2);
    expect(map.get("d2")).toHaveLength(1);
  });

  it("groups by lane and status", () => {
    const lanes = groupByLane(
      [{ id: "a" }, { id: "b" }],
      ["Ready", "Blocked"],
      (x) => (x.id === "a" ? "Ready" : "Unknown"),
      "Blocked",
    );
    expect(lanes.Ready).toHaveLength(1);
    expect(lanes.Blocked).toHaveLength(1);

    const statuses = groupByStatusOrder(
      [
        { _signals: { status: "In Progress" } },
        { _signals: { status: "Weird" } },
      ],
      ["Not Started", "In Progress", "Complete"],
    );
    expect(statuses["In Progress"]).toHaveLength(1);
    expect(statuses["Not Started"]).toHaveLength(1);
  });
});
