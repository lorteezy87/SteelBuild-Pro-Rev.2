import { describe, expect, it } from "vitest";
import { fixDuplicatePdfPages } from "../useDrawingsList";

interface Row {
  id: string;
  sheet_number?: string;
  drawing_number?: string;
  file_url: string | null;
  pdf_page: number | null;
}

const shop = (id: string, sheet_number: string, pdf_page: number | null, file_url = "p/set.pdf"): Row =>
  ({ id, sheet_number, file_url, pdf_page });

/** Map id -> resolved page, so assertions read as a sheet→page mapping. */
const mapping = (rows: unknown) =>
  Object.fromEntries((rows as Row[]).map((r) => [r.id, r.pdf_page]));

describe("fixDuplicatePdfPages — grouping", () => {
  // The core distinction. A set uploaded as one sheet per PDF has every row on
  // page 1 legitimately; only rows sharing a file_url can actually collide.
  // Reading "20 sheets all on pdf_page 1" at the SET level proves nothing.
  it("leaves one-sheet-per-PDF rows alone even though every page is 1", () => {
    const rows = [
      shop("a", "S-101", 1, "p/S-101.pdf"),
      shop("b", "S-102", 1, "p/S-102.pdf"),
      shop("c", "S-103", 1, "p/S-103.pdf"),
    ];
    // Same reference back: nothing was repaired.
    expect(fixDuplicatePdfPages(rows)).toBe(rows);
  });

  it("leaves a clean multi-page set alone", () => {
    const rows = [shop("a", "S-1", 1), shop("b", "S-2", 2), shop("c", "S-3", 3)];
    expect(fixDuplicatePdfPages(rows)).toBe(rows);
  });

  it("does not pool two different files into one collision", () => {
    // Page 1 twice, but in different PDFs — not a collision.
    const rows = [
      shop("a", "S-1", 1, "p/one.pdf"),
      shop("b", "S-2", 2, "p/one.pdf"),
      shop("c", "A-1", 1, "p/two.pdf"),
      shop("d", "A-2", 2, "p/two.pdf"),
    ];
    expect(fixDuplicatePdfPages(rows)).toBe(rows);
  });
});

describe("fixDuplicatePdfPages — the repair is reproducible", () => {
  // The bug this guards: entities.Drawing.filter() applies no ORDER BY, so the
  // rows arrive in whatever order Postgres returns. Walking them in arrival
  // order meant the same stored data could resolve to a different sheet→page
  // mapping on a later load — the viewer would silently show a different sheet.
  it("gives the same mapping no matter what order the rows arrive in", () => {
    const build = (): Row[] => [
      shop("a", "S-1", 1),
      shop("b", "S-2", 1),
      shop("c", "S-3", 1),
      shop("d", "S-4", 1),
    ];

    const inOrder = mapping(fixDuplicatePdfPages(build()));
    const reversed = mapping(fixDuplicatePdfPages([...build()].reverse()));
    const shuffled = mapping(
      fixDuplicatePdfPages([build()[2], build()[0], build()[3], build()[1]]),
    );

    expect(reversed).toEqual(inOrder);
    expect(shuffled).toEqual(inOrder);
  });

  it("reads a fully collapsed set as first sheet to first page", () => {
    // Deliberately arriving backwards.
    const rows = [shop("d", "S-4", 1), shop("c", "S-3", 1), shop("b", "S-2", 1), shop("a", "S-1", 1)];
    expect(mapping(fixDuplicatePdfPages(rows))).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("orders sheet numbers naturally, so S-10 follows S-9", () => {
    const rows = [shop("x", "S-10", 1), shop("y", "S-9", 1)];
    // Lexicographically "S-10" < "S-9", which would invert the set.
    expect(mapping(fixDuplicatePdfPages(rows))).toEqual({ y: 1, x: 2 });
  });

  it("orders GC rows by drawing_number, which is their identifier", () => {
    const rows: Row[] = [
      { id: "g2", drawing_number: "A-102", file_url: "p/asi.pdf", pdf_page: 1 },
      { id: "g1", drawing_number: "A-101", file_url: "p/asi.pdf", pdf_page: 1 },
    ];
    expect(mapping(fixDuplicatePdfPages(rows))).toEqual({ g1: 1, g2: 2 });
  });

  it("breaks ties on id so duplicate sheet numbers cannot swap between loads", () => {
    const rows = [shop("z", "S-1", 1), shop("a", "S-1", 1)];
    const first = mapping(fixDuplicatePdfPages(rows));
    const second = mapping(fixDuplicatePdfPages([...rows].reverse()));
    expect(second).toEqual(first);
    expect(first).toEqual({ a: 1, z: 2 });
  });
});

describe("fixDuplicatePdfPages — partial collisions", () => {
  // Most rows carry a real extracted page; only the duplicates move.
  it("keeps the sheets that already hold unique pages", () => {
    const rows = [
      shop("a", "S-1", 1),
      shop("b", "S-2", 2),
      shop("c", "S-3", 2), // collides with S-2
      shop("d", "S-4", 4),
    ];
    const out = mapping(fixDuplicatePdfPages(rows));
    expect(out.a).toBe(1);
    expect(out.b).toBe(2); // lower sheet number claims the contested page
    expect(out.d).toBe(4);
    expect(out.c).toBe(3); // nearest free page
  });

  it("returns a new array only when it actually changed something", () => {
    const clean = [shop("a", "S-1", 1), shop("b", "S-2", 2)];
    expect(fixDuplicatePdfPages(clean)).toBe(clean);

    const dirty = [shop("a", "S-1", 1), shop("b", "S-2", 1)];
    expect(fixDuplicatePdfPages(dirty)).not.toBe(dirty);
  });
});

describe("fixDuplicatePdfPages — degenerate input", () => {
  it("passes empty and single-row input straight through", () => {
    expect(fixDuplicatePdfPages([])).toEqual([]);
    const one = [shop("a", "S-1", 1)];
    expect(fixDuplicatePdfPages(one)).toBe(one);
  });

  it("keys rows with no file_url by id, so they never pool", () => {
    // Three sheets, no file, all page 1. Nothing to collide inside a PDF.
    const rows: Row[] = [
      { id: "a", sheet_number: "S-1", file_url: null, pdf_page: 1 },
      { id: "b", sheet_number: "S-2", file_url: null, pdf_page: 1 },
      { id: "c", sheet_number: "S-3", file_url: null, pdf_page: 1 },
    ];
    expect(fixDuplicatePdfPages(rows)).toBe(rows);
  });
});
