import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the heavy PDF extractor + the review-flag helper so these tests stay in
// the node env and let us drive validateAndExtract / buildDrawingRecord branches
// directly. normalizeRevisionNumber (drawingUploadUtils) is pure/light — use the real one.
vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(),
  EMPTY_SET_META: { setName: "", setNumber: "", revision: "", issueDate: "", issuedBy: "", discipline: "" },
  parseFilename: vi.fn(),
  validatePdfPage: vi.fn(),
}));
vi.mock("@/components/drawings/intakeReview", () => ({
  sheetReviewFlags: vi.fn(() => ({ needsReview: false, reasons: [] })),
}));

import { extractSheetsFromPdf, parseFilename, validatePdfPage } from "@/lib/pdfSheetExtractor";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";
import { MAX_PDF_SIZE_MB, formatBytes, validateAndExtract, buildDrawingRecord } from "../drawingSetUploadHelpers";

describe("formatBytes (set modal variant)", () => {
  it("HAS a sub-KB 'B' tier and renders KB with one decimal (divergence from the revision modal)", () => {
    // The revision modal would render 500 as "0 KB"; this modal deliberately shows "500 B".
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
});

describe("validateAndExtract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("short-circuits oversize files to a filename-fallback row without calling the extractor", async () => {
    parseFilename.mockReturnValue({ sheetNumber: "A-1", revision: "2" });
    const file = { size: (MAX_PDF_SIZE_MB + 10) * 1024 * 1024, name: "big-A-1.pdf" };
    const result = await validateAndExtract(file);
    expect(extractSheetsFromPdf).not.toHaveBeenCalled();
    expect(result.tooLarge).toBe(true);
    expect(result.scanned).toBe(false);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]).toMatchObject({ sheetNumber: "A-1", revision: "2" });
    expect(result.sheets[0]._note).toContain("File too large for AI extraction");
  });

  it("delegates to the shared extractor for within-limit files", async () => {
    extractSheetsFromPdf.mockResolvedValue({ sheets: [{ sheetNumber: "S-1" }], setMeta: {} });
    const file = { size: 2 * 1024 * 1024, name: "ok.pdf" };
    const opts = { titleblockTemplate: { titleRect: 1 } };
    const result = await validateAndExtract(file, opts);
    expect(extractSheetsFromPdf).toHaveBeenCalledWith(file, opts);
    expect(result.sheets).toEqual([{ sheetNumber: "S-1" }]);
  });
});

describe("buildDrawingRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sheetReviewFlags.mockReturnValue({ needsReview: false, reasons: [] });
  });

  const ctx = {
    fileResults: [{ fileName: "a.pdf", error: null }],
    meta: { discipline: "Structural", defaultStage: "IFA", revision: "1", notes: "batch note" },
    activeProject: { id: "p1", name: "Proj" },
    resolvedSetName: "Main Steel",
    parentSetId: "set-1",
    batchId: "batch-1",
    now: "2026-07-03T00:00:00.000Z",
  };
  const sheet = {
    sheetNumber: "S-1", sheetTitle: "Framing Plan", discipline: "MEP", revision: "2",
    sourceFile: "a.pdf", sourceFileUrl: "https://x/a.pdf", pdfPage: 3, scale: "1/4", _note: "",
  };

  it("maps a reviewed sheet + context into the child drawings payload shape", () => {
    validatePdfPage.mockReturnValue(3);
    const rec = buildDrawingRecord({ sheet, ...ctx });
    expect(rec).toMatchObject({
      sheet_number: "S-1",
      title: "Framing Plan",
      project_id: "p1",
      project_name: "Proj",
      drawing_set_id: "set-1",
      drawing_set_name: "Main Steel",
      discipline: "MEP",          // sheet.discipline wins over meta.discipline
      revision_number: "2",       // normalizeRevisionNumber("2")
      stage: "IFA",
      file_url: "https://x/a.pdf",
      pdf_page: 3,
      upload_batch_id: "batch-1",
      upload_status: "Uploaded",
      ai_extraction_status: "Processed",
      last_extracted_at: "2026-07-03T00:00:00.000Z",
    });
    // notes joins non-empty parts with " · "; empty _note filtered out
    expect(rec.notes).toBe("batch note · Scale: 1/4");
  });

  it("marks ai_extraction_status NeedsReview when the review flag is set", () => {
    validatePdfPage.mockReturnValue(1);
    sheetReviewFlags.mockReturnValue({ needsReview: true, reasons: ["missing sheet #"] });
    const rec = buildDrawingRecord({ sheet, ...ctx });
    expect(rec.ai_extraction_status).toBe("NeedsReview");
  });

  it("falls back pdf_page to 1 when validatePdfPage rejects the page", () => {
    validatePdfPage.mockReturnValue(null);
    const rec = buildDrawingRecord({ sheet: { ...sheet, pdfPage: "bad" }, ...ctx });
    expect(rec.pdf_page).toBe(1);
  });

  it("falls back to meta defaults when the sheet omits discipline/revision", () => {
    validatePdfPage.mockReturnValue(2);
    const bare = { sheetNumber: "S-2", sourceFile: "a.pdf", sourceFileUrl: "u" };
    const rec = buildDrawingRecord({ sheet: bare, ...ctx });
    expect(rec.discipline).toBe("Structural"); // meta.discipline
    expect(rec.revision_number).toBe("1");      // meta.revision via normalizeRevisionNumber
  });
});
