import { describe, it, expect } from "vitest";
import {
  buildDrawingRegisterRows,
  filterDrawingRegisterRows,
  sortDrawingRegisterRows,
} from "../drawingRegister.derive";
import type { CurrentRevisionInfo } from "../types";

/** Minimal drawing-set package fixture. Annotated `: any` to keep the
 *  noImplicitAny ratchet happy with partial fixtures (agent-memory
 *  wave2-page-extraction-ratchets). */
function pkg(over: any = {}): any {
  return {
    key: over.key || "k1",
    setId: over.setId ?? "ds1",
    name: over.name || "Main Steel - IFC",
    parent: "parent" in over ? over.parent : { id: "ds1", discipline: "Structural", set_number: 3, is_locked: false },
    sheets: over.sheets || [],
    submittals: over.submittals || [],
    ...over,
  };
}

function sheet(over: any = {}): any {
  return { id: over.id || "sh1", stage: over.stage, discipline: over.discipline, set_approval_status: over.set_approval_status, revision_number: over.revision_number, ...over };
}

const emptyRev = new Map<string, CurrentRevisionInfo>();

describe("buildDrawingRegisterRows", () => {
  it("derives one row per package with sheetCount, releasedCount, discipline, setNo", () => {
    const rows = buildDrawingRegisterRows({
      setPackages: [
        pkg({
          key: "a",
          name: "Set A",
          sheets: [sheet({ id: "s1", stage: "Released", discipline: "Structural" }), sheet({ id: "s2", stage: "IFA", discipline: "Structural" })],
        }),
      ],
      healthByKey: new Map(),
      currentRevByDrawingId: emptyRev,
      summariesBySet: new Map(),
      workdayDues: false,
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.sheetCount).toBe(2);
    expect(r.releasedCount).toBe(1); // one "Released" sheet
    expect(r.discipline).toBe("Structural");
    expect(r.setNo).not.toBe("TBD"); // parent present → formatted number
  });

  it("counts releasedCount from stage=Released OR set_approval_status=approved (display only)", () => {
    const rows = buildDrawingRegisterRows({
      setPackages: [pkg({ sheets: [sheet({ id: "s1", set_approval_status: "approved" }), sheet({ id: "s2", stage: "IFA" })] })],
      healthByKey: new Map(), currentRevByDrawingId: emptyRev, summariesBySet: new Map(), workdayDues: false,
    });
    expect(rows[0].releasedCount).toBe(1);
  });

  it("falls back to parent.sheet_count when sheets is empty", () => {
    const rows = buildDrawingRegisterRows({
      setPackages: [pkg({ sheets: [], parent: { id: "ds1", sheet_count: 7, discipline: "Misc" } })],
      healthByKey: new Map(), currentRevByDrawingId: emptyRev, summariesBySet: new Map(), workdayDues: false,
    });
    expect(rows[0].sheetCount).toBe(7);
  });

  it("computes the dominant stage across sheets", () => {
    const rows = buildDrawingRegisterRows({
      setPackages: [pkg({ sheets: [sheet({ id: "s1", stage: "IFA" }), sheet({ id: "s2", stage: "IFA" }), sheet({ id: "s3", stage: "OFA" })] })],
      healthByKey: new Map(), currentRevByDrawingId: emptyRev, summariesBySet: new Map(), workdayDues: false,
    });
    expect(rows[0].dominantStage).toBe("IFA");
  });

  it("uses the authoritative current revision (is_current) for maxRev, highest version wins", () => {
    const revMap = new Map<string, CurrentRevisionInfo>([
      ["s1", { code: "A", version: 1 }],
      ["s2", { code: "C", version: 3 }],
    ]);
    const rows = buildDrawingRegisterRows({
      setPackages: [pkg({ sheets: [sheet({ id: "s1" }), sheet({ id: "s2" })] })],
      healthByKey: new Map(), currentRevByDrawingId: revMap, summariesBySet: new Map(), workdayDues: false,
    });
    expect(rows[0].maxRev).toBe("C");
  });

  it("passes health, locked, lockedReason, and revSummary through", () => {
    const rows = buildDrawingRegisterRows({
      setPackages: [pkg({ key: "k9", setId: "ds9", parent: { id: "ds9", is_locked: true, locked_reason: "RFF" } })],
      healthByKey: new Map([["k9", { score: 42 }]]),
      currentRevByDrawingId: emptyRev,
      summariesBySet: new Map([["ds9", { summary: { foo: 1 }, sheets_changed: 4 }]]),
      workdayDues: false,
    });
    const r = rows[0];
    expect(r.health).toEqual({ score: 42 });
    expect(r.locked).toBe(true);
    expect(r.lockedReason).toBe("RFF");
    expect(r.revSummary).toEqual({ summary: { foo: 1 }, sheets_changed: 4 });
  });

  it("sets late=true only when overdue AND not done", () => {
    // Overdue submittal due, package not closed → late.
    const overduePkg = pkg({
      sheets: [sheet({ id: "s1", stage: "IFA" })],
      submittals: [{ id: "sub1", round_number: 1, status: "Open", required_date: "2020-01-01" }],
    });
    const rows = buildDrawingRegisterRows({
      setPackages: [overduePkg], healthByKey: new Map(), currentRevByDrawingId: emptyRev, summariesBySet: new Map(), workdayDues: false,
    });
    expect(rows[0].due.overdue).toBe(true);
    expect(rows[0].done).toBe(false);
    expect(rows[0].late).toBe(true);
  });
});

describe("filterDrawingRegisterRows", () => {
  const rows = [
    { pkg: { name: "Main Steel" }, setNo: "3", discipline: "Structural", status: "Open" } as any,
    { pkg: { name: "Stairs" }, setNo: "7", discipline: "Misc", status: "Approved" } as any,
  ];
  it("returns all rows when search is empty", () => {
    expect(filterDrawingRegisterRows(rows, "")).toHaveLength(2);
  });
  it("matches on name, setNo, discipline, or status (case-insensitive)", () => {
    expect(filterDrawingRegisterRows(rows, "steel").map((r) => r.pkg.name)).toEqual(["Main Steel"]);
    expect(filterDrawingRegisterRows(rows, "misc").map((r) => r.pkg.name)).toEqual(["Stairs"]);
    expect(filterDrawingRegisterRows(rows, "approved").map((r) => r.pkg.name)).toEqual(["Stairs"]);
    expect(filterDrawingRegisterRows(rows, "7").map((r) => r.pkg.name)).toEqual(["Stairs"]);
  });
});

describe("sortDrawingRegisterRows", () => {
  const rows = [
    { pkg: { key: "a", parent: { set_number: 2 } }, health: { score: 90 } } as any,
    { pkg: { key: "b", parent: { set_number: 1 } }, health: { score: 10 } } as any,
    { pkg: { key: "c", parent: { set_number: 3 } }, health: null } as any,
  ];
  it("sorts by health ascending when sortByHealth='asc' (null score sorts last as 101)", () => {
    const out = sortDrawingRegisterRows(rows, "asc");
    expect(out.map((r) => r.pkg.key)).toEqual(["b", "a", "c"]);
  });
  it("sorts by health descending when sortByHealth='desc' (null score → 101 sorts FIRST)", () => {
    const out = sortDrawingRegisterRows(rows, "desc");
    // c has null score (treated as 101, the max) so it leads; then 90 (a), 10 (b).
    expect(out.map((r) => r.pkg.key)).toEqual(["c", "a", "b"]);
  });
  it("falls back to package ordering when sortByHealth is null", () => {
    const out = sortDrawingRegisterRows(rows, null);
    // compareDrawingSetPackages orders by set number: 1, 2, 3 → b, a, c
    expect(out.map((r) => r.pkg.key)).toEqual(["b", "a", "c"]);
  });
});
