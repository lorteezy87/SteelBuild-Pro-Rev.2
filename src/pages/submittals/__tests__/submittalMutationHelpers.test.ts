import { describe, expect, it } from "vitest";
import {
  appendSubmittalNotes,
  buildBulkSubmittalCreatePayload,
  classifyBulkOutcome,
  formatBulkSubmittalToast,
  formatSubmittalWriteError,
  isSubmittalDuplicateNumberError,
} from "../submittalMutationHelpers";

describe("appendSubmittalNotes", () => {
  it("returns append text when prior is empty", () => {
    expect(appendSubmittalNotes("", "new")).toBe("new");
    expect(appendSubmittalNotes(null, "new")).toBe("new");
  });

  it("joins with a blank line when prior has content", () => {
    expect(appendSubmittalNotes("old  ", "new")).toBe("old\n\nnew");
  });
});

describe("isSubmittalDuplicateNumberError", () => {
  it("detects unique-index and duplicate-key messages", () => {
    expect(isSubmittalDuplicateNumberError(new Error("submittals_unique_per_project"))).toBe(true);
    expect(isSubmittalDuplicateNumberError({ message: "duplicate key value" })).toBe(true);
    expect(isSubmittalDuplicateNumberError(new Error("network down"))).toBe(false);
  });
});

describe("formatSubmittalWriteError", () => {
  it("maps duplicate create/update errors to plain English", () => {
    expect(formatSubmittalWriteError(new Error("duplicate key"), "Create")).toMatch(/already exists/);
    expect(formatSubmittalWriteError(new Error("boom"), "Create")).toBe("Create failed: boom");
  });
});

describe("classifyBulkOutcome / formatBulkSubmittalToast", () => {
  it("classifies all_failed / partial / all_ok", () => {
    expect(classifyBulkOutcome(0, 3)).toBe("all_failed");
    expect(classifyBulkOutcome(2, 1)).toBe("partial");
    expect(classifyBulkOutcome(4, 0)).toBe("all_ok");
  });

  it("formats toast levels for update/delete/add", () => {
    expect(formatBulkSubmittalToast("updated", 0, 2).level).toBe("error");
    expect(formatBulkSubmittalToast("deleted", 1, 1).level).toBe("warning");
    expect(formatBulkSubmittalToast("added", 3, 0)).toEqual({
      level: "success",
      message: "Added 3 submittals",
    });
  });
});

describe("buildBulkSubmittalCreatePayload", () => {
  it("forces active project_id and defaults", () => {
    expect(
      buildBulkSubmittalCreatePayload(
        { submittal_number: "S-1", project_id: "other" },
        "proj-1",
        "Demo",
      ),
    ).toMatchObject({
      project_id: "proj-1",
      project_name: "Demo",
      round_number: 1,
      submittal_number: "S-1",
    });
  });

  it("throws when no project is selected", () => {
    expect(() => buildBulkSubmittalCreatePayload({}, null, "")).toThrow(/Select a project/);
  });
});
