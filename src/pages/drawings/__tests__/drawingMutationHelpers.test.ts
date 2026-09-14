import { describe, expect, it } from "vitest";
import {
  buildDrawingCreatePayload,
  formatDeleteSetSuccessMessage,
  formatDrawingWriteError,
} from "../drawingMutationHelpers";

describe("buildDrawingCreatePayload", () => {
  it("forces active project_id and stamps project_name", () => {
    expect(
      buildDrawingCreatePayload(
        { sheet_number: "A1", project_id: "other" },
        "proj-1",
        "Demo",
      ),
    ).toEqual({
      sheet_number: "A1",
      project_id: "proj-1",
      project_name: "Demo",
    });
  });

  it("throws without a project", () => {
    expect(() => buildDrawingCreatePayload({}, null)).toThrow(/Select a project/);
  });
});

describe("formatDrawingWriteError", () => {
  it("prefixes normalized messages", () => {
    expect(formatDrawingWriteError(new Error("boom"), "add")).toBe("Failed to add: boom");
    expect(formatDrawingWriteError(new Error("x"), "delete set")).toBe("Failed to delete set: x");
  });
});

describe("formatDeleteSetSuccessMessage", () => {
  it("formats parent-only and cascade deletes", () => {
    expect(formatDeleteSetSuccessMessage({ setName: "S1", deleted: 0, parentOnly: true })).toEqual({
      level: "success",
      message: 'Deleted set "S1"',
    });
    expect(formatDeleteSetSuccessMessage({ setName: "S1", deleted: 2 })).toEqual({
      level: "success",
      message: 'Deleted "S1" and 2 sheets',
    });
    expect(
      formatDeleteSetSuccessMessage({ setName: "S1", deleted: 1, failedCount: 1 }),
    ).toMatchObject({ level: "warning" });
  });
});
