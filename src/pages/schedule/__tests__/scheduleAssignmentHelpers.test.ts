import { describe, expect, it } from "vitest";
import { buildScheduleResourceAssignPatch } from "../scheduleAssignmentHelpers";

describe("buildScheduleResourceAssignPatch", () => {
  it("assigns matching resource_names and assigned_to", () => {
    expect(buildScheduleResourceAssignPatch("  Crew A  ")).toEqual({
      resource_names: "Crew A",
      assigned_to: "Crew A",
    });
  });

  it("clears both fields for blank / null", () => {
    expect(buildScheduleResourceAssignPatch(null)).toEqual({
      resource_names: null,
      assigned_to: null,
    });
    expect(buildScheduleResourceAssignPatch("  ")).toEqual({
      resource_names: null,
      assigned_to: null,
    });
  });
});
