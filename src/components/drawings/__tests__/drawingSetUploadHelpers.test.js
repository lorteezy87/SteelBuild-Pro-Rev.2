import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pdfSheetExtractor", () => ({
  extractSheetsFromPdf: vi.fn(),
  EMPTY_SET_META: { setName: "", setNumber: "", revision: "", issueDate: "", issuedBy: "", discipline: "" },
  parseFilename: vi.fn(),
  validatePdfPage: vi.fn(),
}));
vi.mock("@/lib/applyTitleblockRevisionOcr", () => ({
  applyTitleblockRevisionOcr: vi.fn(async (_file, sheets) => sheets),
}));
vi.mock("@/components/drawings/intakeReview", () => ({
  sheetReviewFlags: vi.fn(() => ({ needsReview: false, reasons: [] })),
}));

import { extractSheetsFromPdf, parseFilename, validatePdfPage } from "@/lib/pdfSheetExtractor";
import { sheetReviewFlags } from "@/components/drawings/intakeReview";
import {
  MAX_PDF_SIZE_MB, formatBytes, validateAndExtract, buildDrawingRecord,
  makeProgressSteps, mergeAiSetMetadata, detectMultiSheetSamePageRegression,
  planExistingSetSheetReplace,
} from "../drawingSetUploadHelpers";

describe("formatBytes (set modal variant)", () => {
  it("HAS a sub-KB 'B' tier and renders KB with one decimal (divergence from the revision modal)", () => {
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
    expect(result.sheets[0]).toMatchObject({ sheetNumber: "A-1", revision: "2" });
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

describe("planExistingSetSheetReplace", () => {
  it("updates matching live sheets, creates new numbers, and retires leftovers", () => {
    const live = [
      { id: "old-s1", sheet_number: "S-1" },
      { id: "old-s2", sheet_number: "S.2" },
    ];
    const incoming = [
      { sheet_number: "S1", file_url: "new.pdf", pdf_page: 1, revision_number: "2" },
      { sheet_number: "S-3", file_url: "new.pdf", pdf_page: 3, revision_number: "2" },
    ];
    const plan = planExistingSetSheetReplace(live, incoming);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].existing.id).toBe("old-s1");
    expect(plan.toCreate.map((r) => r.sheet_number)).toEqual(["S-3"]);
    expect(plan.toSupersede.map((s) => s.id)).toEqual(["old-s2"]);
  });

  it("inserts everything when the set has no live sheets", () => {
    const incoming = [{ sheet_number: "A-1" }];
    expect(planExistingSetSheetReplace([], incoming)).toEqual({
      toUpdate: [],
      toCreate: incoming,
      toSupersede: [],
    });
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
      revision_number: "2",
      file_url: "https://x/a.pdf",
      pdf_page: 3,
    });
  });
});

describe("makeProgressSteps", () => {
  it("returns the 5 canonical wizard steps in order", () => {
    expect(makeProgressSteps("upload", []).map(s => s.id)).toEqual(["upload", "encode", "extract", "parse", "done"]);
  });
});

describe("mergeAiSetMetadata", () => {
  it("fills blank fields from AI metadata", () => {
    const prev = { setName: "", setNumber: "", revision: "0", issueDate: "2026-07-03", issuedBy: "", discipline: "Structural" };
    const ai = { setName: "100% CD", revision: "2", issueDate: "2026-06-01", issuedBy: "Smith" };
    const { merged } = mergeAiSetMetadata(prev, ai, "2026-07-03");
    expect(merged.setName).toBe("100% CD");
    expect(merged.revision).toBe("2");
  });
});

describe("detectMultiSheetSamePageRegression", () => {
  it("flags a multi-page PDF whose sheets all landed on pdf_page=1", () => {
    const sheets = [{ sourceFile: "a.pdf" }, { sourceFile: "a.pdf" }, { sourceFile: "a.pdf" }];
    const records = [{ pdf_page: 1 }, { pdf_page: 1 }, { pdf_page: 1 }];
    expect(detectMultiSheetSamePageRegression(sheets, records, [{ fileName: "a.pdf", pageCount: 3 }])).toEqual([
      { sourceFile: "a.pdf", sheetCount: 3, pageCount: 3 },
    ]);
  });
});
