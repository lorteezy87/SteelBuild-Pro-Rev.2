import { describe, expect, it } from "vitest";
import {
  buildActionItemAssignPatch,
  buildActionItemBulkAssignUpdates,
  buildActionItemCreatePayload,
} from "../actionItemMutationHelpers";

describe("buildActionItemCreatePayload", () => {
  it("forces active project_id and preserves assignment fields", () => {
    expect(
      buildActionItemCreatePayload(
        { title: "Chase RFI", assigned_to: "Sam", project_id: "other" },
        "proj-1",
      ),
    ).toEqual({
      title: "Chase RFI",
      assigned_to: "Sam",
      project_id: "proj-1",
    });
  });

  it("throws without a project", () => {
    expect(() => buildActionItemCreatePayload({ title: "x" }, null)).toThrow(
      /Select a project/,
    );
  });
});

describe("buildActionItemAssignPatch", () => {
  it("assigns a trimmed owner", () => {
    expect(buildActionItemAssignPatch("  Alice  ")).toEqual({ assigned_to: "Alice" });
  });

  it("clears assignment for null / blank", () => {
    expect(buildActionItemAssignPatch(null)).toEqual({ assigned_to: null });
    expect(buildActionItemAssignPatch("   ")).toEqual({ assigned_to: null });
  });
});

describe("buildActionItemBulkAssignUpdates", () => {
  it("builds one update row per id", () => {
    expect(buildActionItemBulkAssignUpdates(["a", "b"], "Crew A")).toEqual([
      { id: "a", data: { assigned_to: "Crew A" } },
      { id: "b", data: { assigned_to: "Crew A" } },
    ]);
  });
});
