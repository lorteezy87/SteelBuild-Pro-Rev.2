import { describe, expect, it } from "vitest";
import {
  appendSubmittalNotes,
  buildBulkSubmittalCreatePayload,
  buildBulkUpdateRowPatch,
  classifyBulkOutcome,
  formatBulkSubmittalToast,
  formatSheetResponseSaveToast,
  formatSubmittalWriteError,
  isSubmittalDuplicateNumberError,
  splitCreateSubmittalPayload,
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

describe("buildBulkUpdateRowPatch", () => {
  it("appends notes and clears BIC on completed status", () => {
    expect(
      buildBulkUpdateRowPatch(
        { notes: "prior" },
        { status: "Released for Fabrication", ball_in_court: "EOR" },
        "extra",
      ),
    ).toEqual({
      status: "Released for Fabrication",
      ball_in_court: null,
      notes: "prior\n\nextra",
    });
  });

  it("leaves BIC alone for non-closing patches without notes", () => {
    expect(buildBulkUpdateRowPatch(null, { ball_in_court: "GC" })).toEqual({
      ball_in_court: "GC",
    });
  });
});

describe("formatSheetResponseSaveToast", () => {
  it("keeps dialog open on total failure", () => {
    expect(formatSheetResponseSaveToast(0, 2)).toEqual({
      level: "error",
      message: "No sheet responses saved; 2 failed. The dialog remains open for retry.",
      closeDialog: false,
    });
  });

  it("closes on partial or full success", () => {
    expect(formatSheetResponseSaveToast(1, 1).closeDialog).toBe(true);
    expect(formatSheetResponseSaveToast(3, 0)).toEqual({
      level: "success",
      message: "3 sheet response(s) saved",
      closeDialog: true,
    });
  });
});

describe("splitCreateSubmittalPayload", () => {
  it("strips drawing_types from the insert payload", () => {
    expect(
      splitCreateSubmittalPayload({
        title: "Beams",
        drawing_types: ["Shop", "Erection"],
      }),
    ).toEqual({
      chosenTypes: ["Shop", "Erection"],
      submittalData: { title: "Beams" },
    });
  });
});
