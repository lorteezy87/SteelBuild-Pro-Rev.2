import { describe, it, expect } from "vitest";
import { parseLogDate, parseDrawingLog, classifyDrawingRows } from "../importDrawingLog";

// Mirrors the real detailer log: 5 banner rows, a header, category section rows,
// data rows, a duplicate sheet number, and an orphan numeric cell.
const ROWS = [
  ["Academy MS Mesa", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["FABRICATOR JOB NO.: 25421   FABRICATOR NAME : S&H", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["FABRICATOR CO-ORDINATOR: Nicholas Lortz", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["SOL JOB NO.: 2025446", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["S.N", "Description", "Drawing No", "ASS'Y Qty", "Rev.", "Finish", "Date Sent of Approval", "Date Sent of Fab/Field", "Remark", "MOD", "DET", "CHK", "Sheet Size", "Rev Remark"],
  ["ANCHOR BOLT & ERECTION DRAWINGS", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  [1, "ANCHOR BOLT LAYOUT PLAN", "101ABP1", "", "1", "0.0", "14-Nov-25", "29-Jan-26", "For Field Use", "", "HNI", "YHW", "24x36", ""],
  [2, "DETAILS & SECTIONS", "101ABP2", "", "1", "0.0", "14-Nov-25", "29-Jan-26", "For Field Use", "", "HNI", "YHW", "24x36", ""],
  ["MAIN STEEL DRAWINGS", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  [3, "MAIN STEEL PLAN", "502E101", "", "2", "0.0", "28-Nov-25", "13-Feb-26", "For Field Use", "", "HNI", "YHW", "24x36", "FOR FIELD USE"],
  [4, "DUP", "502E101", "", "1", "", "", "", "", "", "", "", "", ""],
  [5, "", "", "", "", "", "", "", "", "", "", "", "", ""],
];

describe("parseLogDate", () => {
  it("parses DD-Mon-YY, ISO, and US dates; rejects junk", () => {
    expect(parseLogDate("14-Nov-25")).toBe("2025-11-14");
    expect(parseLogDate("13-Feb-26")).toBe("2026-02-13");
    expect(parseLogDate("2026-02-13")).toBe("2026-02-13");
    expect(parseLogDate("2/13/2026")).toBe("2026-02-13");
    expect(parseLogDate("0.0")).toBeNull();
    expect(parseLogDate("")).toBeNull();
  });
});

describe("parseDrawingLog", () => {
  const result = parseDrawingLog(ROWS);

  it("skips banner rows, reads sheets, and assigns the category section", () => {
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(3); // 101ABP1, 101ABP2, 502E101 (dup dropped)
    expect(result.stats.categories).toBe(2); // the orphan "5" row is NOT a category
    const ab = result.rows.find((r) => r.sheet_number === "101ABP1");
    expect(ab).toMatchObject({
      title: "ANCHOR BOLT LAYOUT PLAN",
      revision_number: "1",
      category: "ANCHOR BOLT & ERECTION DRAWINGS",
      submitted_date: "2025-11-14",
      issued_date: "2026-01-29",
      detailer: "HNI",
      checker: "YHW",
      sheet_size: "24x36",
    });
  });

  it("carries the later category + revision + rev remark", () => {
    const main = result.rows.find((r) => r.sheet_number === "502E101");
    expect(main).toMatchObject({ category: "MAIN STEEL DRAWINGS", revision_number: "2", issued_date: "2026-02-13", rev_remark: "FOR FIELD USE" });
  });

  it("flags duplicate sheet numbers", () => {
    expect(result.stats.skipped).toBe(1);
    expect(result.skipped[0].reason).toMatch(/Duplicate sheet number: 502E101/);
  });

  it("errors when there is no Drawing No header", () => {
    const r = parseDrawingLog([["foo", "bar"], [1, 2]]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Drawing No/i);
  });
});

describe("classifyDrawingRows", () => {
  it("matches existing sheets by number (update), the rest create", () => {
    const { rows } = parseDrawingLog(ROWS);
    const { stats, rows: staged } = classifyDrawingRows(rows, [
      { id: "d1", sheet_number: "502E101", is_deleted: false },
    ]);
    expect(stats).toEqual({ create: 2, update: 1 });
    expect(staged.find((r) => r.sheet_number === "502E101")).toMatchObject({ action: "update", existing_id: "d1" });
    expect(staged.find((r) => r.sheet_number === "101ABP1").action).toBe("create");
  });

  it("ignores soft-deleted existing drawings", () => {
    const { rows } = parseDrawingLog(ROWS);
    const { stats } = classifyDrawingRows(rows, [{ id: "d1", sheet_number: "502E101", is_deleted: true }]);
    expect(stats.update).toBe(0);
  });
});
