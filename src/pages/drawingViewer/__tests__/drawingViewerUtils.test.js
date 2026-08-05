import { describe, expect, it } from "vitest";
import { pickViewerRecordId, normalizeSN, documentToViewerDrawing } from "../drawingViewerUtils";

describe("drawingViewerUtils", () => {
  it("picks record id from query params", () => {
    const sp = new URLSearchParams("drawingId=d1");
    expect(pickViewerRecordId(sp)).toBe("d1");
    expect(pickViewerRecordId(new URLSearchParams("recordId=r1&id=i1"))).toBe("r1");
    expect(pickViewerRecordId(new URLSearchParams(""))).toBeNull();
  });

  it("normalizes sheet numbers and document adapter", () => {
    expect(normalizeSN("A-1.0")).toBe("A10");
    const d = documentToViewerDrawing({
      id: "x",
      project_id: "p",
      document_number: "DOC-1",
      display_name: "Spec",
      file_name: "a.pdf",
      file_url: "u",
      revision_number: "B",
    });
    expect(d.sheet_number).toBe("DOC-1");
    expect(d.viewer_source).toBe("document");
  });
});
