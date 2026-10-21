/**
 * cranePickPdf.test.ts — the Pick Summary PDF.
 *
 * jsPDF is mocked so these exercise OUR layout and data handling (which values
 * reach the page, page breaks, filename) rather than a PDF engine.
 *
 * The parity test is the important one: the PDF, the clipboard text and the
 * on-screen modal all render `pickSummarySections`, so a figure can never be
 * formatted one way on screen and another way on the printed lift plan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const textCalls: string[] = [];
const { presentGeneratedFile } = vi.hoisted(() => ({ presentGeneratedFile: vi.fn() }));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile }));
vi.mock("jspdf", () => {
  class FakePdf {
    _pages = 1;
    internal = {
      pageSize: { getWidth: () => 612, getHeight: () => 792 },
      getNumberOfPages: () => this._pages,
    };
    setFont() {} setFontSize() {} setTextColor() {} setDrawColor() {}
    setLineWidth() {} setFillColor() {} line() {} rect() {} circle() {}
    splitTextToSize(t: string, width: number) {
      // Approximate the real wrap so page-break behaviour is exercised.
      const max = Math.max(8, Math.floor(width / 5));
      const out: string[] = [];
      for (const para of String(t).split("\n")) {
        let line = "";
        for (const word of para.split(" ")) {
          if (line && (line + " " + word).length > max) { out.push(line); line = word; }
          else line = line ? line + " " + word : word;
        }
        out.push(line);
      }
      return out;
    }
    getTextWidth(t: string) { return String(t).length * 5; }
    addPage() { this._pages += 1; }
    getNumberOfPages() { return this._pages; }
    setPage() {}
    text(t: string | string[]) { textCalls.push(Array.isArray(t) ? t.join(" ") : String(t)); }
    output() { return new Blob(["pdf"], { type: "application/pdf" }); }
  }
  return { jsPDF: FakePdf };
});

import { buildCranePickPdf, downloadCranePickPdf, cranePickPdfFilename } from "../cranePickPdf";
import { buildSummaryText, pickSummarySections, type PickSnapshot } from "../pickSummaryFormat";

const printed = () => textCalls.join("\n");
/** Wrapped text spans several draw calls — collapse whitespace to compare a
 *  long value (the chart basis) against what actually reached the page. */
const printedFlat = () => textCalls.join(" ").replace(/\s+/g, " ");

const FULL: PickSnapshot = {
  capturedAt: "2026-10-21T15:30:00.000Z",
  pieceWeight: 18400, riggingWeight: 850,
  hookBlockWeight: 2400, otherDeductions: 300,
  slingLoad: 19250, totalLoad: 21950,
  numLegs: 4, angleDegrees: 58.2, laf: 1.177, tensionPerLeg: 11330,
  cgMode: "centered", offset: null, legsAssumedCarrying: 2,
  slingWll: 15000, slingUtil: 75.5,
  shackleWll: 12000, shackleUtil: 94.4,
  liftType: "standard",
  craneCapacity: 30000, utilization: 73.2,
  capacityStatus: "green", angleStatus: "green",
  warnings: [
    { severity: "yellow", message: "Four-leg bridle on a rigid load: tension is calculated assuming only TWO legs carry (ASME B30.9)." },
  ],
  boomAngle: 62.4, tipHeight: 88.6,
  craneModel: "Crane 14 — Grove GMK5150L",
  counterweight: "58,000 lb",
  boomLength: "100", workingRadius: "46",
  capacitySource: "chart",
  chart: {
    serial: "SN-99812",
    configuration: "Main boom · 58k CWT · full OR",
    summary: "Outriggers fully extended · 360° · 58,000 lb CWT · telescopic boom",
    source: "Grove GMK5150L chart book rev. C, p. 44",
    basis: "30,000 lb from 100 ft boom / 50 ft radius — radius between 45 ft and 50 ft, so the lower bracketing rating governs. Not interpolated.",
    exact: false,
  },
};

beforeEach(() => { textCalls.length = 0; presentGeneratedFile.mockClear(); });

describe("the PDF carries everything the lift plan needs", () => {
  it("leads with the planning-tool disclaimer", () => {
    buildCranePickPdf(FULL);
    expect(printed()).toContain("PLANNING TOOL ONLY");
    expect(printed()).toContain("Does not replace an engineered lift plan");
  });

  it("prints every section heading", () => {
    buildCranePickPdf(FULL);
    for (const h of ["LOAD", "RIGGING CONFIGURATION", "CAPACITY", "CRANE", "WARNINGS", "REVIEWED"]) {
      expect(printed()).toContain(h);
    }
  });

  it("prints the governing figures", () => {
    buildCranePickPdf(FULL);
    const out = printed();
    expect(out).toContain("21,950 lb");   // gross load against the chart
    expect(out).toContain("11,330 lb");   // tension per leg
    expect(out).toContain("30,000 lb");   // rated capacity
    expect(out).toContain("73.2%");       // utilization
  });

  it("states the 4-leg rigid-load assumption next to the tension", () => {
    buildCranePickPdf(FULL);
    const out = printed();
    expect(out).toContain("4 (2 assumed carrying)");
    expect(out).toMatch(/only 2 of 4 legs assumed carrying/i);
  });

  it("prints the chart provenance beside the capacity it produced", () => {
    buildCranePickPdf(FULL);
    const out = printed();
    expect(out).toContain("Grove GMK5150L chart book rev. C, p. 44");
    expect(out).toContain("SN-99812");
    expect(out).toMatch(/lower bracketing rating governs/);
    expect(out).toMatch(/Not interpolated/);
  });

  it("marks a hand-entered capacity as hand-entered", () => {
    buildCranePickPdf({ ...FULL, chart: null, capacitySource: "manual" });
    expect(printed()).toContain("Entered by hand");
  });

  it("colour-labels warnings by severity", () => {
    buildCranePickPdf({
      ...FULL,
      warnings: [
        { severity: "red", message: "OVERLOAD — 112.0% of rated capacity." },
        { severity: "yellow", message: "Sling angle 38.0° is in the 30–45° range." },
      ],
    });
    const out = printed();
    expect(out).toContain("CRITICAL");
    expect(out).toContain("CAUTION");
    expect(out).toContain("OVERLOAD");
  });

  it("prints an offset-CG pick leg by leg", () => {
    buildCranePickPdf({
      ...FULL,
      numLegs: 2, legsAssumedCarrying: 2, cgMode: "offset", laf: NaN,
      offset: { tension1: 9000, tension2: 4500, angle1: 63.4, angle2: 36.9, share1: 0.667, share2: 0.333, H: 8, d1: 4, d2: 8 },
    });
    const out = printed();
    expect(out).toContain("Leg 1");
    expect(out).toContain("Leg 2");
    expect(out).toContain("67% of vertical");
    expect(out).toContain("H 8 ft");
  });

  it("carries the legacy-snapshot caveats into print", () => {
    // A 4-leg pick recorded before the rigid-load fix: no legsAssumedCarrying,
    // and no slingLoad (so the hook block was never in the gross load).
    const legacy: PickSnapshot = { ...FULL, legsAssumedCarrying: undefined, slingLoad: undefined };
    buildCranePickPdf(legacy);
    const out = printed();
    expect(out).toMatch(/RECORDED BEFORE THE 4-LEG CORRECTION/);
    expect(out).toMatch(/RECORDED BEFORE HOOK-BLOCK DEDUCTIONS/);
  });

  it("survives a snapshot with no warnings array", () => {
    const bare: PickSnapshot = { ...FULL, warnings: undefined };
    expect(() => buildCranePickPdf(bare)).not.toThrow();
    expect(printed()).not.toContain("WARNINGS");
  });

  it("shows a dash rather than a wrong number when a value is missing", () => {
    buildCranePickPdf({ capturedAt: FULL.capturedAt, numLegs: 2 });
    expect(printed()).toContain("—");
  });

  it("says so plainly when a snapshot has no capture time", () => {
    buildCranePickPdf({ numLegs: 2 });
    expect(printed()).toContain("Capture time not recorded");
  });

  it("puts a sign-off block on the sheet", () => {
    buildCranePickPdf(FULL);
    const out = printed();
    expect(out).toContain("PREPARED BY");
    expect(out).toContain("LIFT DIRECTOR / SUPERVISOR");
    expect(out).toContain("CRANE OPERATOR");
    expect(out).toContain("DATE");
  });

  it("repeats the disclaimer and numbers every page", () => {
    buildCranePickPdf(FULL);
    expect(printed()).toMatch(/Page 1 of \d+/);
  });

  it("breaks to a second page when the content overflows", () => {
    const many = Array.from({ length: 24 }, (_, i) => ({
      severity: (i % 2 ? "yellow" : "red") as "yellow" | "red",
      message: `Warning ${i}: ` + "a long explanatory sentence that wraps across the width of the page. ".repeat(3),
    }));
    buildCranePickPdf({ ...FULL, warnings: many });
    expect(printed()).toMatch(/Page 2 of \d+/);
  });
});

describe("download", () => {
  it("hands a PDF blob to the file exporter under a dated name", () => {
    downloadCranePickPdf(FULL, { now: new Date(2026, 9, 21) });
    expect(presentGeneratedFile).toHaveBeenCalledTimes(1);
    const arg = presentGeneratedFile.mock.calls[0][0];
    expect(arg.filename).toBe("Pick-Summary-2026-10-21.pdf");
    expect(arg.title).toBe("Pick Summary");
    expect(arg.blob).toBeInstanceOf(Blob);
  });

  it("includes the job in the filename and keeps it filesystem-safe", () => {
    const name = cranePickPdfFilename(FULL, { projectName: "AMS Mesa / Seq 2", now: new Date(2026, 0, 5) });
    expect(name).toBe("Pick-Summary-AMS_Mesa_Seq_2-2026-01-05.pdf");
    expect(name).not.toMatch(/[/\\:]/);
  });
});

describe("the PDF, the text export and the screen cannot disagree", () => {
  it("prints every value the clipboard text does", () => {
    buildCranePickPdf(FULL);
    const out = printedFlat();
    // Every value rendered by the shared section builder must reach the page.
    for (const section of pickSummarySections(FULL)) {
      for (const r of section.rows) {
        if (!r.v || r.v === "—") continue;
        const head = r.v.split(" (")[0].replace(/\s+/g, " ").trim();
        expect(out, `missing "${head}" from the PDF`).toContain(head);
      }
    }
  });

  it("uses the same wording as the clipboard text for the headline figures", () => {
    const text = buildSummaryText(FULL);
    buildCranePickPdf(FULL);
    const out = printed();
    for (const token of ["21,950 lb", "11,330 lb", "30,000 lb", "73.2%", "4 (2 assumed carrying)"]) {
      expect(text).toContain(token);
      expect(out).toContain(token);
    }
  });

  it("reports tons as US short tons in both artifacts", () => {
    const text = buildSummaryText(FULL);
    buildCranePickPdf(FULL);
    expect(text).toContain("10.975 T");       // 21,950 lb / 2000
    expect(printed()).toContain("10.975 T");
  });
});
