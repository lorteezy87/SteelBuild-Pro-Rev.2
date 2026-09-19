import { describe, it, expect } from "vitest";
import {
  calloutSheetKey,
  detectCallouts,
  MAX_CALLOUTS_PER_SHEET,
  type PositionedTextItem,
} from "@/lib/calloutDetection";
import { normalizeSN } from "@/pages/drawingViewer/drawingViewerUtils";

const PAGE_HEIGHT = 792;

function item(str: string, over: Partial<PositionedTextItem> = {}): PositionedTextItem {
  return { str, x: 100, y: 700, width: 60, height: 10, ...over };
}

function targets(items: PositionedTextItem[], selfSheetNumber?: string) {
  return detectCallouts(items, { pageHeight: PAGE_HEIGHT, selfSheetNumber }).map(
    (c) => c.targetSheetNumber,
  );
}

describe("detectCallouts — what counts as a reference", () => {
  it.each([
    ["SEE S-401", "S-401"],
    ["SEE SHEET S401", "S401"],
    ["REFER TO DWG S-201", "S-201"],
    ["PER S301", "S301"],
    ["DETAIL A/S-401", "S-401"],
    ["SECTION 2/S301", "S301"],
    ["3/S-401", "S-401"],
    ["A/S301", "S301"],
  ])("detects %s", (text, expected) => {
    expect(targets([item(text)])).toEqual([expected]);
  });

  it.each([
    "S-401",                      // a bare token is not a reference
    "GRID S1",
    "1/4\" = 1'-0\"",             // scale
    "N/A",
    "9/19",                       // a date
    "TYP. OF 4",
    "W12X26",
    "",
  ])("does NOT invent a reference from %s", (text) => {
    expect(targets([item(text)])).toEqual([]);
  });

  it("never reports a sheet as referencing itself", () => {
    // A detail bubble pointing at this very page is not a cross-sheet jump.
    expect(targets([item("3/S-401")], "S401")).toEqual([]);
    expect(targets([item("3/S-401")], "S-401")).toEqual([]);
    expect(targets([item("3/S-401")], "S-402")).toEqual(["S-401"]);
  });

  it("collapses the same reference repeated, but keeps different wordings", () => {
    const out = detectCallouts(
      [item("SEE S-401"), item("SEE S-401"), item("3/S-401")],
      { pageHeight: PAGE_HEIGHT },
    );
    expect(out.map((c) => c.text)).toEqual(["SEE S-401", "3/S-401"]);
  });

  it("caps how many callouts one page can contribute", () => {
    const many = Array.from({ length: 200 }, (_, i) => item(`SEE S-${(i % 900) + 100}`));
    expect(detectCallouts(many, { pageHeight: PAGE_HEIGHT })).toHaveLength(MAX_CALLOUTS_PER_SHEET);
    expect(detectCallouts(many, { pageHeight: PAGE_HEIGHT, maxCallouts: 5 })).toHaveLength(5);
  });
});

describe("detectCallouts — coordinates", () => {
  it("flips the PDF baseline into the top-down box the overlay draws with", () => {
    // Baseline 700 from the bottom, 10 tall → top edge is 792 - 710 = 82.
    const [callout] = detectCallouts([item("SEE S-401", { x: 120, y: 700, width: 60, height: 10 })], {
      pageHeight: PAGE_HEIGHT,
    });
    expect(callout.coords).toEqual({ x: 120, y: 82, width: 60, height: 10 });
  });

  it("puts a near-bottom reference near the bottom of the page", () => {
    const [callout] = detectCallouts([item("SEE S-401", { y: 10, height: 10 })], {
      pageHeight: PAGE_HEIGHT,
    });
    expect(callout.coords.y).toBeCloseTo(772, 1);
  });

  it("always emits coordinates — a callout without them can never be found", () => {
    const out = detectCallouts(
      [item("SEE S-401", { width: 0, height: 0 })],
      { pageHeight: PAGE_HEIGHT },
    );
    expect(out).toHaveLength(1);
    expect(out[0].coords.width).toBeGreaterThan(0);
    expect(out[0].coords.height).toBeGreaterThan(0);
  });

  it("never emits a negative coordinate", () => {
    const [callout] = detectCallouts([item("SEE S-401", { x: -5, y: 1000, height: 10 })], {
      pageHeight: PAGE_HEIGHT,
    });
    expect(callout.coords.x).toBeGreaterThanOrEqual(0);
    expect(callout.coords.y).toBeGreaterThanOrEqual(0);
  });

  it("returns nothing when the page height is unusable", () => {
    for (const pageHeight of [0, -1, NaN, undefined as unknown as number]) {
      expect(detectCallouts([item("SEE S-401")], { pageHeight })).toEqual([]);
    }
  });

  it("tolerates a missing item list", () => {
    expect(detectCallouts(null, { pageHeight: PAGE_HEIGHT })).toEqual([]);
    expect(detectCallouts(undefined, { pageHeight: PAGE_HEIGHT })).toEqual([]);
  });
});

describe("calloutSheetKey", () => {
  /**
   * Detection and resolution must agree. The viewer resolves a callout against
   * the project's drawings with `normalizeSN`; if this key drifted from it, a
   * callout would be detected here and match nothing there.
   */
  it.each(["S-401", "s401", "S 401", "S_401", "S.401"])(
    "agrees with the viewer's normalizeSN for %s",
    (value) => {
      expect(calloutSheetKey(value)).toBe(normalizeSN(value));
    },
  );

  it("is empty for nothing", () => {
    expect(calloutSheetKey(null)).toBe("");
    expect(calloutSheetKey(undefined)).toBe("");
  });
});
