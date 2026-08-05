// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  addDaysUTC, shiftDateOnly, loadColWidths, DEFAULT_COL_WIDTHS, COL_WIDTHS_KEY,
  findFirstRowAtOrAfter, findFirstRowAfter,
  getTaskMetadata, getTaskBaseline, hasBaselineDrift, isCriticalTask,
  taskSearchHaystack, pluralize, isStalledTask, isOpenScheduleTask,
  isSummaryScheduleTask, isActionableScheduleTask, taskOwner, isUnassignedTask,
  hasLogicGapTask, isLookaheadTask,
} from "../scheduleGanttHelpers";

describe("date helpers", () => {
  it("addDaysUTC shifts by UTC days without mutating the input", () => {
    const base = new Date("2026-06-10T00:00:00.000Z");
    const out = addDaysUTC(base, 5);
    expect(out.toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(base.toISOString().slice(0, 10)).toBe("2026-06-10"); // not mutated
    expect(addDaysUTC(new Date("2026-06-10T00:00:00.000Z"), -3).toISOString().slice(0, 10)).toBe("2026-06-07");
  });

  it("shiftDateOnly returns a date-only string or null for unparseable input", () => {
    expect(shiftDateOnly("2026-06-10", 2)).toBe("2026-06-12");
    expect(shiftDateOnly("", 2)).toBeNull();
    expect(shiftDateOnly(null, 2)).toBeNull();
  });
});

describe("column-width persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns defaults when nothing is stored", () => {
    expect(loadColWidths()).toEqual(DEFAULT_COL_WIDTHS);
  });

  it("clamps stored widths to the hard min/max and keeps the 0 (flex) column", () => {
    const stored = DEFAULT_COL_WIDTHS.map(() => 5); // all below MIN_COL_WIDTH(24)
    stored[1] = 0; // flex column stays 0
    window.localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(stored));
    const out = loadColWidths();
    expect(out[1]).toBe(0);
    expect(out[0]).toBe(24); // clamped up to MIN_COL_WIDTH
  });

  it("falls back to defaults on a wrong-length or corrupt payload", () => {
    window.localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify([1, 2, 3]));
    expect(loadColWidths()).toEqual(DEFAULT_COL_WIDTHS);
    window.localStorage.setItem(COL_WIDTHS_KEY, "not json");
    expect(loadColWidths()).toEqual(DEFAULT_COL_WIDTHS);
  });
});

describe("row-geometry binary searches", () => {
  const rows = [
    { top: 0, height: 40 },
    { top: 40, height: 40 },
    { top: 80, height: 40 },
  ];
  it("findFirstRowAtOrAfter finds the row whose bottom edge reaches y", () => {
    expect(findFirstRowAtOrAfter(rows, 0)).toBe(0);
    expect(findFirstRowAtOrAfter(rows, 50)).toBe(1);
    expect(findFirstRowAtOrAfter(rows, 1000)).toBe(3); // past the end
  });
  it("findFirstRowAfter finds the first row strictly below y", () => {
    expect(findFirstRowAfter(rows, -1)).toBe(0);
    expect(findFirstRowAfter(rows, 40)).toBe(2);
  });
});

describe("metadata + baseline", () => {
  it("getTaskMetadata parses object, JSON string, and tolerates junk", () => {
    expect(getTaskMetadata({ metadata: { a: 1 } })).toEqual({ a: 1 });
    expect(getTaskMetadata({ metadata: '{"b":2}' })).toEqual({ b: 2 });
    expect(getTaskMetadata({ metadata: "not json" })).toEqual({});
    expect(getTaskMetadata({})).toEqual({});
  });

  it("getTaskBaseline returns null only when neither bound is set", () => {
    expect(getTaskBaseline({ metadata: {} })).toBeNull();
    expect(getTaskBaseline({ metadata: { baseline_start: "2026-06-01" } })).toEqual({ start: "2026-06-01", end: null });
  });

  it("hasBaselineDrift is true only when effective dates differ from baseline", () => {
    const task = { metadata: { baseline_start: "2026-06-01", baseline_end: "2026-06-10" } };
    expect(hasBaselineDrift(task, "2026-06-01", "2026-06-10")).toBe(false);
    expect(hasBaselineDrift(task, "2026-06-02", "2026-06-10")).toBe(true);
    expect(hasBaselineDrift({ metadata: {} }, "x", "y")).toBe(false); // no baseline
  });
});

describe("task predicates", () => {
  it("isCriticalTask reads any of the critical flags (column or metadata)", () => {
    expect(isCriticalTask({ is_critical: true })).toBe(true);
    expect(isCriticalTask({ metadata: { critical_path: true } })).toBe(true);
    expect(isCriticalTask({ status: "In Progress" })).toBe(false);
  });

  it("taskSearchHaystack joins searchable fields lowercased", () => {
    const h = taskSearchHaystack({ task_name: "Set Columns", wbs_code: "1.2", status: "In Progress" }, "Detailing");
    expect(h).toContain("set columns");
    expect(h).toContain("1.2");
    expect(h).toContain("detailing");
  });

  it("pluralize", () => {
    expect(pluralize(1, "task")).toBe("1 task");
    expect(pluralize(3, "task")).toBe("3 tasks");
    expect(pluralize(2, "gap", "gaps")).toBe("2 gaps");
  });

  it("isOpen / isSummary / isActionable / taskOwner", () => {
    expect(isOpenScheduleTask({ status: "In Progress" })).toBe(true);
    expect(isOpenScheduleTask({ status: "Complete" })).toBe(false);
    expect(isOpenScheduleTask({ status: "Cancelled" })).toBe(false);
    expect(isSummaryScheduleTask({ _hasChildren: true })).toBe(true);
    expect(isActionableScheduleTask({ is_summary: true })).toBe(false);
    expect(taskOwner({ resource_names: "  Crew A " })).toBe("Crew A");
    expect(taskOwner({ assigned_to: "Jane" })).toBe("Jane");
    expect(taskOwner({})).toBe("");
  });

  it("isUnassignedTask: open + actionable + no owner", () => {
    expect(isUnassignedTask({ status: "In Progress" })).toBe(true);
    expect(isUnassignedTask({ status: "In Progress", resource_names: "Crew" })).toBe(false);
    expect(isUnassignedTask({ status: "Complete" })).toBe(false); // closed
    expect(isUnassignedTask({ status: "In Progress", is_summary: true })).toBe(false); // summary
  });

  it("hasLogicGapTask flags only fully-unlinked, non-milestone open tasks", () => {
    const succ = { t2: 1 };
    expect(hasLogicGapTask({ id: "t1", status: "In Progress", dependencies: "" }, succ)).toBe(true); // no preds, no succs
    expect(hasLogicGapTask({ id: "t2", status: "In Progress", dependencies: "" }, succ)).toBe(false); // has a successor
    expect(hasLogicGapTask({ id: "t3", status: "In Progress", dependencies: [{ id: "9" }] }, succ)).toBe(false); // has a predecessor
    expect(hasLogicGapTask({ id: "t4", status: "In Progress", dependencies: "", milestone: true }, succ)).toBe(false); // milestone exempt
    expect(hasLogicGapTask({ id: "t5", status: "Complete", dependencies: "" }, succ)).toBe(false); // closed
  });

  it("isStalledTask: started in the past, 0% done, not complete", () => {
    const today = new Date("2026-06-15T00:00:00.000Z");
    const parseStart = (t) => (t.start ? new Date(t.start) : null);
    expect(isStalledTask({ start: "2026-06-10", status: "In Progress", percent_complete: 0 }, today, parseStart)).toBe(true);
    expect(isStalledTask({ start: "2026-06-10", status: "In Progress", percent_complete: 20 }, today, parseStart)).toBe(false);
    expect(isStalledTask({ start: "2026-06-20", status: "In Progress", percent_complete: 0 }, today, parseStart)).toBe(false); // future
    expect(isStalledTask({ start: "2026-06-10", status: "Complete", percent_complete: 0 }, today, parseStart)).toBe(false);
  });

  it("isLookaheadTask: window overlaps [today, today+days]", () => {
    const today = new Date("2026-06-15T00:00:00.000Z");
    const getStart = (t) => t.start;
    const getEnd = (t) => t.end;
    expect(isLookaheadTask({ start: "2026-06-16", end: "2026-06-18" }, today, getStart, getEnd)).toBe(true);
    expect(isLookaheadTask({ start: "2026-07-30", end: "2026-08-01" }, today, getStart, getEnd)).toBe(false); // beyond 14d
    expect(isLookaheadTask({ start: "2026-06-16", end: "2026-06-18", status: "Complete" }, today, getStart, getEnd)).toBe(false);
  });
});
