import { describe, it, expect, beforeAll, vi } from "vitest";
import { parseAnnotationLink } from "../annotationLinks";

// parseAnnotationLink resolves annot.url against window.location.origin, so we
// need a stable origin for the URL-validation tests. jsdom provides window,
// but assert it here so the SECURITY assertions can't silently pass under a
// missing global.
beforeAll(() => {
  if (typeof window === "undefined" || !window.location?.origin) {
    // Minimal shim — the URL constructor only needs a valid base string.
    // eslint-disable-next-line no-global-assign
    globalThis.window = { location: { origin: "https://app.example.com" } };
  }
});

const drawings = [
  { id: "d-s201", sheet_number: "S-201", title: "Level 2 Framing" },
  { id: "d-a101", sheet_number: "A101", title: "Floor Plan" },
];

// A pdfDoc test double whose destination resolution is programmable.
const mkPdfDoc = ({ destination = null, pageIndex = null, throws = false } = {}) => ({
  getDestination: vi.fn(async () => {
    if (throws) throw new Error("boom");
    return destination;
  }),
  getPageIndex: vi.fn(async () => {
    if (throws) throw new Error("boom");
    return pageIndex;
  }),
});

describe("parseAnnotationLink — internal PDF destinations", () => {
  it("resolves a named destination to a 1-based page within range", async () => {
    const pdfDoc = mkPdfDoc({ destination: ["ref"], pageIndex: 3 });
    const out = await parseAnnotationLink(
      { dest: "chapter-2" },
      { pdfDoc, totalPages: 10, drawings },
    );
    expect(out).toEqual({ type: "page", page: 4 }); // pageIndex 3 + 1
  });

  it("resolves an explicit destination array to a page", async () => {
    const pdfDoc = mkPdfDoc({ pageIndex: 0 });
    const out = await parseAnnotationLink(
      { dest: ["ref", "XYZ"] },
      { pdfDoc, totalPages: 10, drawings },
    );
    expect(out).toEqual({ type: "page", page: 1 });
  });

  it("falls through to cross-sheet when the resolved page is out of range", async () => {
    const pdfDoc = mkPdfDoc({ pageIndex: 99 }); // page 100 > totalPages
    const out = await parseAnnotationLink(
      { dest: ["ref"], title: "DETAIL 3 / S-201" },
      { pdfDoc, totalPages: 10, drawings },
    );
    expect(out).toEqual({ type: "sheet", drawingId: "d-s201" });
  });

  it("falls through to cross-sheet when destination resolution throws", async () => {
    const pdfDoc = mkPdfDoc({ throws: true });
    const out = await parseAnnotationLink(
      { dest: "broken", title: "S-201" },
      { pdfDoc, totalPages: 10, drawings },
    );
    expect(out).toEqual({ type: "sheet", drawingId: "d-s201" });
  });
});

describe("parseAnnotationLink — external URL validation (SECURITY)", () => {
  it("accepts an http URL", async () => {
    const out = await parseAnnotationLink(
      { url: "http://example.com/spec.pdf" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "url", url: "http://example.com/spec.pdf" });
  });

  it("accepts an https URL", async () => {
    const out = await parseAnnotationLink(
      { url: "https://example.com/spec.pdf" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "url", url: "https://example.com/spec.pdf" });
  });

  // ── REJECTION cases — must NOT resolve to { type: "url" } ──────────────
  it("rejects a javascript: URL (XSS payload)", async () => {
    const out = await parseAnnotationLink(
      { url: "javascript:alert(document.cookie)" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("rejects a data: URL", async () => {
    const out = await parseAnnotationLink(
      { url: "data:text/html,<script>alert(1)</script>" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("rejects a file: URL", async () => {
    const out = await parseAnnotationLink(
      { url: "file:///etc/passwd" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("rejects a vbscript: URL", async () => {
    const out = await parseAnnotationLink(
      { url: "vbscript:msgbox(1)" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("rejects a mailto: URL (non-http scheme)", async () => {
    const out = await parseAnnotationLink(
      { url: "mailto:evil@example.com" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("does NOT fall through to cross-sheet after an unsafe URL, even if title matches a sheet", async () => {
    // The original handler `return`s immediately in the url branch — a
    // poisoned javascript: link with a sheet-looking title must NOT navigate.
    const out = await parseAnnotationLink(
      { url: "javascript:alert(1)", title: "S-201" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
    expect(out.type).not.toBe("sheet");
  });

  it("rejects a URL the constructor cannot parse even with a base (empty authority)", async () => {
    // `new URL("http://", base)` throws (no host), exercising the catch → none.
    const out = await parseAnnotationLink(
      { url: "http://" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("resolves a scheme-less relative string against the app origin as http(s) (preserved behavior)", async () => {
    // NOTE: this documents EXISTING behavior, not new behavior. The original
    // handler used `new URL(annot.url, window.location.origin)`, so a
    // scheme-less string is treated as a relative reference under the app's
    // own (https) origin and therefore passes the http(s) scheme check. The
    // returned url is the raw annot.url (what window.open receives).
    const raw = "some/relative/path";
    const out = await parseAnnotationLink(
      { url: raw },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "url", url: raw });
  });
});

describe("parseAnnotationLink — cross-sheet references", () => {
  it("matches a dashed sheet number", async () => {
    const out = await parseAnnotationLink(
      { title: "SEE S-201 FOR DETAILS" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "sheet", drawingId: "d-s201" });
  });

  it("matches a compact sheet number against a dashed stored sheet_number", async () => {
    const out = await parseAnnotationLink(
      { title: "3/S201" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "sheet", drawingId: "d-s201" });
  });

  it("uses unsafeUrl as the reference text when title is absent", async () => {
    const out = await parseAnnotationLink(
      { unsafeUrl: "A101" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "sheet", drawingId: "d-a101" });
  });

  it("returns none when the reference text matches no drawing", async () => {
    const out = await parseAnnotationLink(
      { title: "SEE Z-999" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });

  it("returns none when there is nothing actionable on the annotation", async () => {
    const out = await parseAnnotationLink(
      { title: "GENERAL NOTES" },
      { pdfDoc: mkPdfDoc(), totalPages: 5, drawings },
    );
    expect(out).toEqual({ type: "none" });
  });
});
