// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const pdf = vi.hoisted(() => ({
  load: vi.fn(),
  destroy: vi.fn(async () => {}),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: pdf.load,
}));

import { readPdfPageCount } from "../pdfPageCount";

describe("PDF page count for keyed drawing intake", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the actual PDF page count and closes the parser", async () => {
    pdf.load.mockReturnValue({ promise: Promise.resolve({ numPages: 3, destroy: pdf.destroy }) });
    const count = await readPdfPageCount(new File(["%PDF-1.4"], "shop.pdf", { type: "application/pdf" }));
    expect(count).toBe(3);
    expect(pdf.load).toHaveBeenCalledOnce();
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it("fails closed when PDF page length cannot be proven", async () => {
    pdf.load.mockImplementation(() => ({ promise: Promise.reject(new Error("invalid PDF")) }));
    expect(await readPdfPageCount(new File(["bad"], "bad.pdf", { type: "application/pdf" }))).toBeNull();
  });
});
