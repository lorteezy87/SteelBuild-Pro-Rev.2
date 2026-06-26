import { describe, it, expect } from "vitest";
import { resolveFabMarks, summarizeFabStatus, FAB_STATUS_ORDER } from "../fabStatus";

const map = (entries) => new Map(entries);

describe("resolveFabMarks", () => {
  it("uses the roster mark for a selected piece that is in the roster", () => {
    const marks = resolveFabMarks({
      picked: { assemblyMark: "A1", partMark: "p1" },
      selectedGuids: ["g1"],
      guidToMark: map([["g1", "A1"]]),
    });
    expect(marks).toEqual(["A1"]);
  });

  it("falls back to the clicked piece's LIVE mark when its GUID is not in the roster (re-exported model)", () => {
    // The bug: GUID drifted, so guidToMark misses it — but the piece IS marked.
    const marks = resolveFabMarks({
      picked: { assemblyMark: "703GR1009", partMark: "t1014" },
      selectedGuids: ["guid-not-in-roster"],
      guidToMark: map([["some-other-guid", "A9"]]),
    });
    expect(marks).toEqual(["703GR1009"]);
  });

  it("prefers the Assembly mark over the Part mark, and de-dupes", () => {
    const marks = resolveFabMarks({
      picked: { assemblyMark: "A1", partMark: "p1" },
      selectedGuids: ["g1"],
      guidToMark: map([["g1", "A1"]]), // same mark as live → one entry
    });
    expect(marks).toEqual(["A1"]);
  });

  it("uses the Part mark when there is no Assembly mark", () => {
    const marks = resolveFabMarks({
      picked: { partMark: "t1014" },
      selectedGuids: [],
      guidToMark: map([]),
    });
    expect(marks).toEqual(["t1014"]);
  });

  it("combines the live mark with roster marks across a multi-selection", () => {
    const marks = resolveFabMarks({
      picked: { assemblyMark: "B2" }, // last-clicked
      selectedGuids: ["g1", "g2", "g3"],
      guidToMark: map([["g1", "A1"], ["g2", "A2"]]), // g3 not in roster
    });
    expect(marks).toEqual(["B2", "A1", "A2"]);
  });

  it("returns nothing for a genuinely unmarked piece not in the roster", () => {
    const marks = resolveFabMarks({
      picked: { name: "JOIST" }, // no assembly/part mark
      selectedGuids: ["gX"],
      guidToMark: map([]),
    });
    expect(marks).toEqual([]);
  });

  it("is safe with no arguments", () => {
    expect(resolveFabMarks()).toEqual([]);
  });
});

describe("summarizeFabStatus", () => {
  it("counts elements by fab_status and computes coverage", () => {
    const els = [
      { fab_status: "erected" }, { fab_status: "erected" },
      { fab_status: "in_fabrication" },
      { fab_status: null }, { fab_status: "" }, {},
      { fab_status: "bogus" },
    ];
    const s = summarizeFabStatus(els);
    expect(s.total).toBe(7);
    expect(s.counts.erected).toBe(2);
    expect(s.counts.in_fabrication).toBe(1);
    expect(s.withFabStatus).toBe(3);
    expect(s.pct).toBe(Math.round((3 / 7) * 100));
  });
  it("handles empty input", () => {
    const s = summarizeFabStatus([]);
    expect(s.total).toBe(0);
    expect(s.withFabStatus).toBe(0);
    expect(s.pct).toBe(0);
    for (const k of FAB_STATUS_ORDER) expect(s.counts[k]).toBe(0);
  });
  it("ignores deleted elements", () => {
    const s = summarizeFabStatus([{ fab_status: "erected", is_deleted: true }, { fab_status: "shipped" }]);
    expect(s.total).toBe(1);
    expect(s.counts.shipped).toBe(1);
  });
});
