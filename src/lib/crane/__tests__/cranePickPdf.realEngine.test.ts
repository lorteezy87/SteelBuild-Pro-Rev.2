/**
 * cranePickPdf.realEngine.test.ts — the one test that uses the real jsPDF.
 *
 * The sibling suite mocks the engine, which is right for layout and data
 * handling but cannot catch this class of bug: the mock records whatever string
 * we hand it, so a value the real font cannot encode looks fine there.
 *
 * jsPDF draws with Helvetica under WinAnsiEncoding and embeds no Unicode face.
 * Up to U+00FF the bytes come out verbatim. One code point above it and jsPDF
 * widens the ENTIRE string to UTF-16, which the simple Type 1 font then reads
 * byte by byte — `CG→pick` reaches the page as ` C G! p i c k`. The line is
 * lost, not the character, and the em dash alone appears in every unknown-value
 * placeholder and in every page footer.
 *
 * So this reads the generated document's own content streams and asserts the
 * text operators hold the sheet's real wording. It is slower than the mocked
 * suite by design: nothing else can prove the output.
 */
import { describe, it, expect } from "vitest";
import { buildCranePickPdf } from "../cranePickPdf";
import type { PickSnapshot } from "../pickSummaryFormat";

/**
 * A pick that exercises every character the sheet can emit: offset CG (the
 * arrow), both legacy caveats (the warning sign), a chart source and missing
 * values (em dashes), plus free text nobody sanitised upstream.
 */
const HOSTILE: PickSnapshot = {
  capturedAt: "2026-10-21T15:30:00.000Z",
  pieceWeight: 18400, riggingWeight: 850,
  hookBlockWeight: 2400, otherDeductions: 300,
  slingLoad: undefined,               // legacy: predates hook-block deductions
  totalLoad: 21950,
  numLegs: 4, angleDegrees: 58.2, laf: 1.177, tensionPerLeg: 11330,
  cgMode: "offset",
  offset: { tension1: 9000, tension2: 4500, angle1: 63.4, angle2: 36.9, share1: 0.667, share2: 0.333, H: 8, d1: 4, d2: 8 },
  legsAssumedCarrying: undefined,     // legacy: predates the 4-leg correction
  slingWll: 15000, slingUtil: 75.5,
  shackleWll: undefined, shackleUtil: undefined,
  liftType: "standard",
  craneCapacity: 30000, utilization: 73.2,
  capacityStatus: "green", angleStatus: "green",
  warnings: [
    { severity: "red", message: "Boom → obstruction — re-check ‘clearance’ ≥ 3 ft" },
    { severity: "yellow", message: "Pick radius within 10% of the charted limit…" },
  ],
  chart: {
    configuration: "Main boom — 60 ft",
    summary: "60 ft boom · 30 ft radius",
    source: "Grove RT9130E-2 — load chart rev. “C”",
    basis: "Read 30 ft / 60 ft cell; nearest bracketing entry",
  },
};

/** Every string jsPDF wrote with a text-showing operator, in page order. */
function textOperands(pdf: ReturnType<typeof buildCranePickPdf>): string[] {
  const bytes = Buffer.from(pdf.output("arraybuffer") as ArrayBuffer).toString("latin1");
  const out: string[] = [];
  // Uncompressed content streams: `(literal) Tj`, one per draw call.
  for (const m of bytes.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
    out.push(m[1].replace(/\\([()\\])/g, "$1"));
  }
  return out;
}

describe("the generated PDF is encodable by the font it is drawn with", () => {
  const pdf = buildCranePickPdf(HOSTILE, { projectName: "Mesa — Seq 2 中文", now: new Date(2026, 9, 21) });
  const operands = textOperands(pdf);
  const page = operands.join("\n");

  it("writes something at all (guards the operand reader itself)", () => {
    expect(operands.length).toBeGreaterThan(40);
    expect(page).toContain("PICK SUMMARY");
  });

  it("emits no code point above U+00FF anywhere on the sheet", () => {
    const offenders = operands.filter((s) => /[^\u0000-ÿ]/.test(s));
    expect(offenders, `unencodable text reached the page: ${JSON.stringify(offenders.slice(0, 5))}`).toEqual([]);
  });

  it("never widens a string to UTF-16", () => {
    // A widened literal interleaves NUL bytes with the ASCII it came from; that
    // is exactly what the simple font renders as " C G! p i c k".
    const widened = operands.filter((s) => s.includes("\u0000"));
    expect(widened, `UTF-16 widening would corrupt these lines: ${JSON.stringify(widened.slice(0, 5))}`).toEqual([]);
  });

  it("keeps the offset-CG geometry legible after transliteration", () => {
    expect(page).toContain("CG->pick 1 4 ft");
    expect(page).toContain("CG->pick 2 8 ft");
  });

  it("keeps both legacy caveats legible, marker and all", () => {
    expect(page).toMatch(/! RECORDED BEFORE THE 4-LEG CORRECTION/);
    expect(page).toMatch(/! RECORDED BEFORE HOOK-BLOCK DEDUCTIONS/);
  });

  it("keeps the degree sign and middle dot, which the font does carry", () => {
    // An offset-CG pick prints no single "Sling Angle" row — the degrees are on
    // the per-leg rows instead.
    expect(page).toMatch(/63\.4°/);
    expect(page).toMatch(/36\.9°/);
    expect(page).toContain("60 ft boom · 30 ft radius");
  });

  it("prints the footer disclaimer with its separator intact", () => {
    // The em dash here used to widen every footer on every page.
    expect(page).toMatch(/PLANNING TOOL ONLY - /);
    expect(page).toMatch(/Page 1 of \d+/);
  });

  it("degrades free text it cannot encode without losing the line", () => {
    // The job name carried CJK; the rest of the header must survive it.
    const header = operands.find((s) => s.includes("Mesa"));
    expect(header).toBeDefined();
    expect(header).toContain("Mesa - Seq 2");
    expect(header).not.toMatch(/[^\u0000-ÿ]/);
  });
});
