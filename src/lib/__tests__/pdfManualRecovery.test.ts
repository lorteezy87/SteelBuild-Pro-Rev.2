// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ scanned: false, invoke: vi.fn() }));
vi.mock("@/api/supabaseClient", () => ({ integrations: { Core: { InvokeLLM: fixture.invoke } } }));
vi.mock("@/lib/pdfTitleblockText", () => ({ extractTextFromRect: async (page: { pageNo: number }, rect: { x: number }) => rect.x === 0 ? `TITLE ${page.pageNo}` : `S${page.pageNo}` }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({ promise: Promise.resolve({
    numPages: 3, destroy: async () => {},
    getPage: async (pageNo: number) => ({
      pageNo,
      getViewport: () => ({ height: 1000 }),
      getTextContent: async () => ({ items: fixture.scanned ? [] : [{ str: "STRUCTURAL DRAWING TITLE BLOCK AND CONNECTION NOTES", transform: [1, 0, 0, 1, 10, 10] }] }),
    }),
  }) }),
}));
import { extractSheetsFromPdf } from "../pdfSheetExtractor";

beforeEach(() => { fixture.scanned = false; fixture.invoke.mockReset(); });
describe("manual PDF recovery", () => {
  it.each(["transport failure", "scanned"])("retains all physical pages after %s without inventing sheet identities", async (mode) => {
    fixture.scanned = mode === "scanned";
    fixture.invoke.mockRejectedValue(new Error("Failed to send a request to the Edge Function"));
    const file = new File(["%PDF-1.4"], "S-101-package.pdf", { type: "application/pdf" });
    const result = await extractSheetsFromPdf(file);
    expect(result.pageCount).toBe(3);
    expect(result.sheets.map(sheet => sheet.pdfPage)).toEqual([1, 2, 3]);
    expect(result.sheets.map(sheet => sheet.sheetNumber)).toEqual(["", "", ""]);
    expect(result.sheets.every(sheet => sheet._note)).toBe(true);
    expect(fixture.invoke).toHaveBeenCalledTimes(mode === "scanned" ? 0 : 1);
  });

  it("binds template OCR to explicit physical pages, not model row order", async () => {
    fixture.invoke.mockResolvedValue({ protocol_version: 8, tool_use: { name: "report_drawing_set", input: { setMeta: {}, sheets: [
      { sheetNumber: "S3", sheetTitle: "THIRD", pdfPage: 3 },
      { sheetNumber: "S1", sheetTitle: "FIRST", pdfPage: 1 },
      { sheetNumber: "S2", sheetTitle: "SECOND", pdfPage: 2 },
    ] } } });
    const result = await extractSheetsFromPdf(new File(["%PDF-1.4"], "package.pdf"), { titleblockTemplate: {
      titleRect: { x: 0, y: 0, width: 0.1, height: 0.1 },
      numberRect: { x: 0.2, y: 0, width: 0.1, height: 0.1 },
    } });
    expect(result.sheets.map(sheet => [sheet.sheetNumber, sheet.sheetTitle, sheet.pdfPage])).toEqual([
      ["S3", "TITLE 3", 3], ["S1", "TITLE 1", 1], ["S2", "TITLE 2", 2],
    ]);
  });
});
