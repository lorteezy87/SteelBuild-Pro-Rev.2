import { describe, expect, it } from "vitest";
import {
  buildDrawingCreatePayload,
  buildDrawingMetadataUpdate,
  formatDeleteSetSuccessMessage,
  formatDrawingWriteError,
} from "../drawingMutationHelpers";

describe("drawing source edit containment", () => {
  const current = { file_url: "old.pdf", pdf_page: 2, revision_number: "A", drawing_set_id: "set-a", drawing_set_name: "SET A", sheet_number: "S1", project_id: "project-a" };
  it.each(["file_url", "pdf_page", "revision_number", "drawing_set_id", "drawing_set_name", "sheet_number", "project_id"])("refuses changing %s through generic metadata editing", field => {
    expect(() => buildDrawingMetadataUpdate(current, { [field]: "different" })).toThrow(/source.*revision/i);
  });
  it("omits unchanged source values so a metadata save cannot overwrite a newer source", () => {
    expect(buildDrawingMetadataUpdate(current, { ...current, notes: "Safe note", pdf_page: "2" })).toEqual({ notes: "Safe note" });
  });
  it("does not coerce an unknown original page into page one", () => {
    expect(() => buildDrawingMetadataUpdate({ ...current, pdf_page: null }, { pdf_page: 1 })).toThrow();
  });
  it.each(['title', 'stage', 'set_approval_status', 'is_deleted', 'metadata', 'unexpected_field'])('rejects protected %s through metadata editing', field => {
    expect(() => buildDrawingMetadataUpdate(current, { notes: 'safe', [field]: 'change' })).toThrow(/source.*revision|protected/i);
  });
});

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
