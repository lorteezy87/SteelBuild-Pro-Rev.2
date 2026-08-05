import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jsPDF so the test exercises OUR layout logic (data handling, page breaks,
// filename) deterministically — no real PDF engine, no DOM needed.
const textCalls = [];
const saveCalls = [];
vi.mock("jspdf", () => {
  class FakePdf {
    constructor() {
      this._pages = 1;
      this.internal = {
        pageSize: { getWidth: () => 612, getHeight: () => 792 },
        getNumberOfPages: () => this._pages,
      };
    }
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {} setLineWidth() {} setFillColor() {}
    line() {} circle() {}
    splitTextToSize(t) { return String(t).split("\n"); }
    getTextWidth(t) { return String(t).length * 5; }
    addPage() { this._pages += 1; }
    setPage() {}
    text(t) { textCalls.push(Array.isArray(t) ? t.join(" ") : String(t)); }
    save(name) { saveCalls.push(name); }
  }
  return { jsPDF: FakePdf };
});

import { buildRevisionImpactPdf, downloadRevisionImpactPdf } from "../revisionImpactPDF";

const SAMPLE = {
  set: { name: "Main Steel - IFC" },
  summary: { totalDeltas: 3, sheetsDiffed: 2, sheetsChanged: 2, downstreamExposure: 1, sheetsBlocked: 0, bySeverity: { critical: 1, high: 1, medium: 1, low: 0, info: 0 } },
  results: [
    {
      sheetNumber: "S2.1", downstream: "fabricated", renderable: true, deltas: [
        { severity: "critical", delta_type: "connection_change", description: "Moment connection added at GL C-3.", recommended_action: "Confirm with EOR." },
        { severity: "medium", delta_type: "dimension_change", description: "Beam length 24'-6\" to 24'-9\".", dismissed: true },
      ],
    },
    { sheetNumber: "S2.2", downstream: null, renderable: false, deltas: [] },
  ],
  now: new Date(2026, 5, 16),
};

describe("buildRevisionImpactPdf", () => {
  beforeEach(() => { textCalls.length = 0; saveCalls.length = 0; });

  it("emits the title, set name, sheet numbers, and kept delta text", () => {
    buildRevisionImpactPdf(SAMPLE);
    const blob = textCalls.join(" | ");
    expect(blob).toContain("Revision Impact Report");
    expect(blob).toContain("Main Steel - IFC");
    expect(blob).toContain("S2.1");
    expect(blob).toContain("Moment connection added");
    expect(blob).toContain("Confirm with EOR");
    // the non-renderable sheet shows its note instead of deltas
    expect(blob).toContain("no captured prior-revision file");
  });

  it("excludes dismissed deltas from the report", () => {
    buildRevisionImpactPdf(SAMPLE);
    expect(textCalls.join(" | ")).not.toContain("24'-9");
  });

  it("does not throw on empty / partial / malformed data", () => {
    expect(() => buildRevisionImpactPdf({ set: { name: "x" }, results: [], summary: null })).not.toThrow();
    expect(() => buildRevisionImpactPdf({})).not.toThrow();
    expect(() => buildRevisionImpactPdf({ results: [null, { sheetNumber: "A", renderable: true, deltas: null }] })).not.toThrow();
  });

  it("downloads with a sanitized, locally-dated filename", () => {
    downloadRevisionImpactPdf(SAMPLE);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0]).toBe("Revision-Impact-Main_Steel_-_IFC-2026-06-16.pdf");
  });

  it("falls back to a default filename when the set has no name", () => {
    downloadRevisionImpactPdf({ ...SAMPLE, set: {} });
    expect(saveCalls[0]).toBe("Revision-Impact-drawing-set-2026-06-16.pdf");
  });
});
