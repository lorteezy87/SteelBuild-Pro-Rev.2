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
import { MAX_PDF_SIZE_MB, formatBytes, validateAndExtract, buildDrawingRecord, makeProgressSteps, mergeAiSetMetadata, detectMultiSheetSamePageRegression } from "../drawingSetUploadHelpers";

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

describe("makeProgressSteps", () => {
  it("returns the 5 canonical wizard steps in order", () => {
    const steps = makeProgressSteps("upload", []);
    expect(steps.map(s => s.id)).toEqual(["upload", "encode", "extract", "parse", "done"]);
  });

  it("marks a step done when its id is in doneIds", () => {
    const steps = makeProgressSteps("extract", ["upload", "encode"]);
    const byId = Object.fromEntries(steps.map(s => [s.id, s]));
    expect(byId.upload.done).toBe(true);
    expect(byId.encode.done).toBe(true);
    expect(byId.extract.done).toBe(false);
    expect(byId.parse.done).toBe(false);
    expect(byId.done.done).toBe(false);
  });

  it("propagates the extract warning flag when provided", () => {
    const warned = makeProgressSteps("parse", ["upload", "encode", "extract"], { extract: true });
    expect(warned.find(s => s.id === "extract").warning).toBe(true);
    const unwarned = makeProgressSteps("parse", ["upload", "encode", "extract"], {});
    expect(unwarned.find(s => s.id === "extract").warning).toBeUndefined();
  });

  it("carries the extract detail string and a null 'done' label", () => {
    const steps = makeProgressSteps(null, ["upload", "encode", "extract", "parse", "done"]);
    expect(steps.find(s => s.id === "extract").detail).toBe("Scanning title blocks and sheet index");
    expect(steps.find(s => s.id === "done").label).toBeNull();
  });
});

describe("mergeAiSetMetadata", () => {
  const DEFAULT_DATE = "2026-07-03";

  it("fills blank fields from AI metadata and records which were filled", () => {
    // discipline starts as the non-blank default "Structural" and has NO
    // default-treated-as-blank exception (matching the modal), so the AI
    // discipline value does NOT win — the other blank fields do.
    const prev = { setName: "", setNumber: "", revision: "0", issueDate: DEFAULT_DATE, issuedBy: "", discipline: "Structural" };
    const ai = { setName: "100% CD", setNumber: "P-03", revision: "2", issueDate: "2026-06-01", issuedBy: "Smith", discipline: "MEP" };
    const { merged, aiFilled } = mergeAiSetMetadata(prev, ai, DEFAULT_DATE);
    expect(merged).toMatchObject({ setName: "100% CD", setNumber: "P-03", revision: "2", issueDate: "2026-06-01", issuedBy: "Smith", discipline: "Structural" });
    expect(aiFilled).toEqual({ setName: true, setNumber: true, revision: true, issueDate: true, issuedBy: true });
  });

  it("DOES fill discipline from AI when the previous discipline is blank", () => {
    const prev = { setName: "S", setNumber: "n", revision: "1", issueDate: "2026-05-05", issuedBy: "b", discipline: "" };
    const ai = { discipline: "MEP" };
    const { merged, aiFilled } = mergeAiSetMetadata(prev, ai, DEFAULT_DATE);
    expect(merged.discipline).toBe("MEP");
    expect(aiFilled.discipline).toBe(true);
  });

  it("never overwrites a user-entered value", () => {
    const prev = { setName: "My Set", setNumber: "", revision: "3", issueDate: "2026-05-05", issuedBy: "Me", discipline: "Civil" };
    const ai = { setName: "AI Set", setNumber: "X-1", revision: "9", issueDate: "2026-06-01", issuedBy: "Them", discipline: "Arch" };
    const { merged, aiFilled } = mergeAiSetMetadata(prev, ai, DEFAULT_DATE);
    // user values preserved
    expect(merged.setName).toBe("My Set");
    expect(merged.revision).toBe("3");
    expect(merged.issueDate).toBe("2026-05-05");
    expect(merged.issuedBy).toBe("Me");
    expect(merged.discipline).toBe("Civil");
    // only the truly-blank setNumber gets filled
    expect(merged.setNumber).toBe("X-1");
    expect(aiFilled).toEqual({ setNumber: true });
  });

  it("treats today's default issueDate and a '0'/empty revision as blank", () => {
    const prev = { setName: "S", setNumber: "n", revision: "0", issueDate: DEFAULT_DATE, issuedBy: "b", discipline: "d" };
    const ai = { revision: "5", issueDate: "2026-01-01" };
    const { merged, aiFilled } = mergeAiSetMetadata(prev, ai, DEFAULT_DATE);
    expect(merged.revision).toBe("5");
    expect(merged.issueDate).toBe("2026-01-01");
    expect(aiFilled).toEqual({ revision: true, issueDate: true });
  });

  it("falls back to drawingSetNumber for setNumber when setNumber AI key is empty", () => {
    const prev = { setName: "S", setNumber: "", revision: "1", issueDate: "2026-05-05", issuedBy: "b", discipline: "d" };
    const ai = { drawingSetNumber: "DS-9" };
    const { merged, aiFilled } = mergeAiSetMetadata(prev, ai, DEFAULT_DATE);
    expect(merged.setNumber).toBe("DS-9");
    expect(aiFilled.setNumber).toBe(true);
  });
});

describe("detectMultiSheetSamePageRegression", () => {
  it("flags a multi-page PDF whose sheets all landed on pdf_page=1", () => {
    const sheets = [{ sourceFile: "a.pdf" }, { sourceFile: "a.pdf" }, { sourceFile: "a.pdf" }];
    const records = [{ pdf_page: 1 }, { pdf_page: 1 }, { pdf_page: 1 }];
    const fileResults = [{ fileName: "a.pdf", pageCount: 3 }];
    expect(detectMultiSheetSamePageRegression(sheets, records, fileResults)).toEqual([
      { sourceFile: "a.pdf", sheetCount: 3, pageCount: 3 },
    ]);
  });

  it("does NOT flag when sheets span different pages", () => {
    const sheets = [{ sourceFile: "a.pdf" }, { sourceFile: "a.pdf" }];
    const records = [{ pdf_page: 1 }, { pdf_page: 2 }];
    const fileResults = [{ fileName: "a.pdf", pageCount: 2 }];
    expect(detectMultiSheetSamePageRegression(sheets, records, fileResults)).toEqual([]);
  });

  it("does NOT flag a single-sheet group or a single-page PDF", () => {
    const single = detectMultiSheetSamePageRegression(
      [{ sourceFile: "a.pdf" }],
      [{ pdf_page: 1 }],
      [{ fileName: "a.pdf", pageCount: 1 }],
    );
    expect(single).toEqual([]);
    const onePage = detectMultiSheetSamePageRegression(
      [{ sourceFile: "b.pdf" }, { sourceFile: "b.pdf" }],
      [{ pdf_page: 1 }, { pdf_page: 1 }],
      [{ fileName: "b.pdf", pageCount: 1 }],
    );
    expect(onePage).toEqual([]);
  });

  it("does NOT flag when pageCount is unknown (non-finite)", () => {
    const sheets = [{ sourceFile: "a.pdf" }, { sourceFile: "a.pdf" }];
    const records = [{ pdf_page: 1 }, { pdf_page: 1 }];
    const fileResults = [{ fileName: "a.pdf" }]; // no pageCount
    expect(detectMultiSheetSamePageRegression(sheets, records, fileResults)).toEqual([]);
  });
});
