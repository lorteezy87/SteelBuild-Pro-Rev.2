import { describe, expect, it } from "vitest";
import {
  buildGcCompareModel,
  type GcChainSet,
  type GcChainSheet,
} from "../gcRevisionChain";

/**
 * The GC compare candidate model.
 *
 * Grounding fact for these tests: as of 2026-09-19, `is_superseded` and
 * `superseded_by_id` are set on 0 of 146 production gc_drawings rows. Anything
 * that only works when those columns are populated does not work at all.
 */

const sets: GcChainSet[] = [
  { id: "set-base", set_name: "Construction Set - Structural", doc_type: "gc_drawing", doc_number: "003", issued_date: "2026-07-07" },
  { id: "set-asi", set_name: "ASI 012", doc_type: "asi", doc_number: "ASI 012", issued_date: "2026-09-01" },
  { id: "set-undated", set_name: "Field packet", doc_type: "gc_drawing", doc_number: null, issued_date: null, received_date: null },
];

function sheet(over: Partial<GcChainSheet> & { id: string }): GcChainSheet {
  return {
    project_id: "p1",
    gc_drawing_set_id: "set-base",
    drawing_number: "SE305",
    title: "Roof framing",
    revision: "1",
    file_url: "projects/p1/base.pdf",
    pdf_page: 4,
    is_superseded: false,
    superseded_by_id: null,
    ...over,
  };
}

describe("buildGcCompareModel", () => {
  it("pairs two issuances of the same sheet number with no supersession links set", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi", revision: "2", file_url: "projects/p1/asi012.pdf", pdf_page: 2 });

    const model = buildGcCompareModel({ active: base, sheets: [base, reissue], sets });

    expect(model.unavailable).toBeNull();
    expect(model.candidates.map((c) => c.key)).toEqual(["b", "a"]); // newest issuance first
    expect(model.usedLinks).toBe(false);
    expect(model.versionCount).toBe(2);
  });

  it("carries each candidate's own file and page, not the active sheet's", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi", file_url: "projects/p1/asi012.pdf", pdf_page: 2 });

    const { candidates } = buildGcCompareModel({ active: base, sheets: [base, reissue], sets });

    expect(candidates.find((c) => c.key === "b")).toMatchObject({ fileUrl: "projects/p1/asi012.pdf", pdfPage: 2 });
    expect(candidates.find((c) => c.key === "a")).toMatchObject({ fileUrl: "projects/p1/base.pdf", pdfPage: 4 });
  });

  it("labels a candidate the way a PM names the issuance", () => {
    const base = sheet({ id: "a" });
    const reissue = sheet({ id: "b", gc_drawing_set_id: "set-asi", revision: "2" });

    const { candidates } = buildGcCompareModel({ active: base, sheets: [base, reissue], sets });

    expect(candidates[0].label).toBe("ASI 012 · Rev 2 · 2026-09-01");
  });

  // Two rows that happen to share a set but describe different sheets must not
  // pair. This is the failure that would show a diff between unrelated sheets.
  it("does not match a different sheet number", () => {
    const base = sheet({ id: "a" });
    const other = sheet({ id: "b", drawing_number: "SE401", gc_drawing_set_id: "set-asi" });

    const model = buildGcCompareModel({ active: base, sheets: [base, other], sets });

    expect(model.unavailable).toBe("single-version");
    expect(model.candidates.map((c) => c.key)).toEqual(["a"]);
  });

  // "2 SE303" is a real production row, extracted from a sheet titled SE303.
  // Normalizing it onto SE303 would be a guess; the tool must not make it.
  it("leaves a mis-extracted number unmatched rather than guessing", () => {
    const good = sheet({ id: "a", drawing_number: "SE303" });
    const mangled = sheet({ id: "b", drawing_number: "2 SE303", gc_drawing_set_id: "set-asi" });

    const model = buildGcCompareModel({ active: good, sheets: [good, mangled], sets });

    expect(model.unavailable).toBe("single-version");
  });

  // Without the empty-key guard every unnumbered row becomes a "version" of
  // every other unnumbered row, and the modal offers nonsense pairs.
  it("never pools unnumbered sheets together", () => {
    const a = sheet({ id: "a", drawing_number: null });
    const b = sheet({ id: "b", drawing_number: null, gc_drawing_set_id: "set-asi" });
    const c = sheet({ id: "c", drawing_number: "   ", gc_drawing_set_id: "set-asi" });

    const model = buildGcCompareModel({ active: a, sheets: [a, b, c], sets });

    expect(model.candidates.map((k) => k.key)).toEqual(["a"]);
    expect(model.unavailable).toBe("single-version");
  });

  it("uses an explicit supersession link even when the numbers differ", () => {
    const base = sheet({ id: "a", drawing_number: "SE305", is_superseded: true, superseded_by_id: "b" });
    const reissue = sheet({ id: "b", drawing_number: "SE305-R1", gc_drawing_set_id: "set-asi" });

    const model = buildGcCompareModel({ active: base, sheets: [base, reissue], sets });

    expect(model.unavailable).toBeNull();
    expect(model.usedLinks).toBe(true);
    expect(model.candidates.find((c) => c.key === "b")?.linked).toBe(true);
  });

  it("walks the link chain backward from the newest sheet", () => {
    const oldest = sheet({ id: "a", drawing_number: "X1", superseded_by_id: "b" });
    const middle = sheet({ id: "b", drawing_number: "X2", gc_drawing_set_id: "set-asi", superseded_by_id: "c" });
    const newest = sheet({ id: "c", drawing_number: "X3", gc_drawing_set_id: "set-asi" });

    const model = buildGcCompareModel({ active: newest, sheets: [oldest, middle, newest], sets });

    expect(model.candidates.map((c) => c.key).sort()).toEqual(["a", "b", "c"]);
  });

  // A self-referential or looping link is corrupt data, not a reason to hang
  // the viewer in an infinite walk.
  it("survives a cyclic supersession link", () => {
    const a = sheet({ id: "a", drawing_number: "Y1", superseded_by_id: "b" });
    const b = sheet({ id: "b", drawing_number: "Y2", gc_drawing_set_id: "set-asi", superseded_by_id: "a" });

    const model = buildGcCompareModel({ active: a, sheets: [a, b], sets });

    expect(model.candidates.map((c) => c.key).sort()).toEqual(["a", "b"]);
  });

  // Each of these is a different message to the reader; collapsing them to a
  // bare "nothing to compare" reads as a broken feature.
  describe("distinguishes why there is nothing to compare", () => {
    it("reports no sheet selected", () => {
      expect(buildGcCompareModel({ active: null, sheets: [], sets }).unavailable).toBe("no-sheet");
    });

    it("reports the active sheet having no PDF", () => {
      const a = sheet({ id: "a", file_url: null });
      const b = sheet({ id: "b", gc_drawing_set_id: "set-asi" });
      expect(buildGcCompareModel({ active: a, sheets: [a, b], sets }).unavailable).toBe("no-file");
    });

    it("separates 'only one version' from 'the other version has no PDF'", () => {
      const a = sheet({ id: "a" });
      const alone = buildGcCompareModel({ active: a, sheets: [a], sets });
      expect(alone.unavailable).toBe("single-version");

      const b = sheet({ id: "b", gc_drawing_set_id: "set-asi", file_url: null });
      const paired = buildGcCompareModel({ active: a, sheets: [a, b], sets });
      expect(paired.unavailable).toBe("versions-without-files");
      expect(paired.versionCount).toBe(2);
      expect(paired.withoutFile).toBe(1);
    });
  });

  // An undated issuance is unknown, not oldest. Sorting it to the bottom would
  // assert it predates the original, which nothing in the data supports.
  it("sorts an undated issuance last rather than treating it as oldest", () => {
    const base = sheet({ id: "a" });
    const undated = sheet({ id: "b", gc_drawing_set_id: "set-undated" });
    const asi = sheet({ id: "c", gc_drawing_set_id: "set-asi" });

    const { candidates } = buildGcCompareModel({ active: base, sheets: [base, undated, asi], sets });

    expect(candidates.map((c) => c.key)).toEqual(["c", "a", "b"]);
    expect(candidates[2].issuedOn).toBeNull();
  });

  it("orders deterministically when two issuances share a date", () => {
    const setsSameDay: GcChainSet[] = [
      { id: "s1", doc_number: "ASI 012", issued_date: "2026-09-01" },
      { id: "s2", doc_number: "ASI 013", issued_date: "2026-09-01" },
    ];
    const a = sheet({ id: "zzz", gc_drawing_set_id: "s1" });
    const b = sheet({ id: "aaa", gc_drawing_set_id: "s2" });

    const first = buildGcCompareModel({ active: a, sheets: [a, b], sets: setsSameDay });
    const second = buildGcCompareModel({ active: a, sheets: [b, a], sets: setsSameDay });

    expect(first.candidates.map((c) => c.key)).toEqual(second.candidates.map((c) => c.key));
  });

  it("falls back to received_date when the set was never given an issued date", () => {
    const setsReceived: GcChainSet[] = [
      { id: "s1", doc_number: "ASI 012", issued_date: null, received_date: "2026-09-03" },
    ];
    const a = sheet({ id: "a", gc_drawing_set_id: "s1" });

    const { candidates } = buildGcCompareModel({ active: a, sheets: [a], sets: setsReceived });

    expect(candidates[0].issuedOn).toBe("2026-09-03");
    expect(candidates[0].label).toBe("ASI 012 · Rev 1 · 2026-09-03");
  });
});
