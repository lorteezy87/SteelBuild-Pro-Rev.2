import { describe, expect, it } from "vitest";
import {
  buildRfiAlertPayload,
  buildRfiAttachmentDocumentPayload,
  buildRfiCreatePayload,
  classifyBulkOutcome,
  formatBulkRfiToast,
  formatRfiNotifyError,
} from "../rfiMutationHelpers";

describe("buildRfiCreatePayload", () => {
  it("forces active project_id", () => {
    expect(buildRfiCreatePayload({ title: "x", project_id: "other" }, "proj-1")).toEqual({
      title: "x",
      project_id: "proj-1",
    });
  });

  it("throws without a project", () => {
    expect(() => buildRfiCreatePayload({ title: "x" }, null)).toThrow(/Select a project/);
  });
});

describe("buildRfiAttachmentDocumentPayload / buildRfiAlertPayload", () => {
  it("stamps project_id", () => {
    expect(buildRfiAttachmentDocumentPayload({ file_name: "a.pdf" }, "p1").project_id).toBe("p1");
    expect(buildRfiAlertPayload({ title: "t" }, "p2").project_id).toBe("p2");
  });
});

describe("bulk toast helpers", () => {
  it("classifies outcomes", () => {
    expect(classifyBulkOutcome(0, 2)).toBe("all_failed");
    expect(classifyBulkOutcome(1, 1)).toBe("partial");
    expect(classifyBulkOutcome(3, 0)).toBe("all_ok");
  });

  it("formats update/delete toasts", () => {
    expect(formatBulkRfiToast("updated", 2, 0)).toEqual({ level: "success", message: "RFIs updated" });
    expect(formatBulkRfiToast("deleted", 1, 0).message).toBe("1 RFI deleted");
    expect(formatBulkRfiToast("updated", 1, 2).level).toBe("warning");
  });
});

describe("formatRfiNotifyError", () => {
  it("prefixes a normalized message", () => {
    expect(formatRfiNotifyError(new Error("boom"))).toBe("Couldn't notify field: boom");
  });
});
