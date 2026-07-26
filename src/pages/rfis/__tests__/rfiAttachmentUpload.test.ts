import { describe, expect, it } from "vitest";
import {
  buildRfiAttachmentDocumentFields,
  canUploadRfiAttachments,
  formatRfiAttachmentUploadToast,
  rfiAttachmentSizeKb,
} from "../rfiAttachmentUpload";

describe("canUploadRfiAttachments", () => {
  it("requires a saved RFI id and at least one file", () => {
    expect(canUploadRfiAttachments({ id: "r1" }, [{ name: "a.pdf" }])).toBe(true);
    expect(canUploadRfiAttachments({ id: null }, [{ name: "a.pdf" }])).toBe(false);
    expect(canUploadRfiAttachments({ id: "r1" }, [])).toBe(false);
    expect(canUploadRfiAttachments(null, [{ name: "a.pdf" }])).toBe(false);
  });
});

describe("rfiAttachmentSizeKb", () => {
  it("rounds up to at least 1 KB", () => {
    expect(rfiAttachmentSizeKb(0)).toBe(1);
    expect(rfiAttachmentSizeKb(500)).toBe(1);
    expect(rfiAttachmentSizeKb(2048)).toBe(2);
  });
});

describe("buildRfiAttachmentDocumentFields", () => {
  it("shapes Document.create fields for an uploaded PDF", () => {
    const fields = buildRfiAttachmentDocumentFields({
      rfiRecord: {
        id: "rfi-1",
        rfi_number: "RFI #042",
        discipline: "Structural",
        project_name: "",
      },
      file: { name: "detail.pdf", size: 4096, type: "" },
      fileUrl: "https://cdn.example/detail.pdf",
      projectName: "Tower A",
      uploadedBy: "",
      nowIso: "2026-07-26T15:30:00.000Z",
    });

    expect(fields).toEqual({
      project_name: "Tower A",
      rfi_id: "rfi-1",
      display_name: "detail.pdf",
      description: "Attachment for RFI #042",
      file_name: "detail.pdf",
      file_url: "https://cdn.example/detail.pdf",
      file_type: "pdf",
      file_size_kb: 4,
      mime_type: "application/pdf",
      category: "RFI",
      document_type: "RFI Attachment",
      discipline: "Structural",
      status: "Current",
      revision_number: "0",
      revision_date: "2026-07-26",
      uploaded_by: "Unknown",
      uploaded_date: "2026-07-26T15:30:00.000Z",
      tags: ["RFI", "RFI #042"],
    });
  });

  it("falls back to rfi id in tags when number is missing", () => {
    const fields = buildRfiAttachmentDocumentFields({
      rfiRecord: { id: "rfi-9" },
      file: { name: "a.pdf", size: 10, type: "application/pdf" },
      fileUrl: "u",
      projectName: "",
      uploadedBy: "me@x.com",
      nowIso: "2026-01-01T00:00:00.000Z",
    });
    expect(fields.tags).toEqual(["RFI", "rfi-9"]);
    expect(fields.description).toBe("Attachment for RFI");
    expect(fields.discipline).toBe("Other");
    expect(fields.uploaded_by).toBe("me@x.com");
  });
});

describe("formatRfiAttachmentUploadToast", () => {
  it("returns null when nothing ran", () => {
    expect(formatRfiAttachmentUploadToast(0, 0)).toBeNull();
  });

  it("formats partial / all-failed / all-ok copy", () => {
    expect(formatRfiAttachmentUploadToast(2, 1, "RFI #1")).toEqual({
      level: "warning",
      message: "2 PDFs attached; 1 failed. RFI was saved.",
    });
    expect(formatRfiAttachmentUploadToast(0, 1)).toEqual({
      level: "error",
      message: "RFI was saved, but 1 PDF attachment failed.",
    });
    expect(formatRfiAttachmentUploadToast(1, 0, "RFI #9")).toEqual({
      level: "success",
      message: "1 PDF attached to RFI #9",
    });
    expect(formatRfiAttachmentUploadToast(2, 0, null)).toEqual({
      level: "success",
      message: "2 PDFs attached to RFI",
    });
  });
});
