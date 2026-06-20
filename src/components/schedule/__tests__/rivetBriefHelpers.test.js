import { describe, it, expect } from "vitest";
import { PHASES } from "@/utils/phases";
import {
  dateValue, isOpenTask, isSummaryTask, isWorkTask, taskOwner, daysFromToday, taskName, phaseOf,
  dependencyIds, dependencyCount, taskMetadata, isCriticalTask, progressValue, taskDate,
  formatBriefTask, formatAnalysisDate, daysBetween, shiftedByDays,
} from "@/components/schedule/rivetBriefHelpers";

// Date-sensitive helpers use new Date() internally, so compute expectations
// relative to today. Noon avoids any midnight/DST edge (and AZ has no DST).
function daysOut(n) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

describe("dateValue", () => {
  it("parses a valid date and rejects invalid/empty", () => {
    expect(dateValue("2026-06-24")).toBeInstanceOf(Date);
    expect(dateValue("")).toBeNull();
    expect(dateValue(null)).toBeNull();
    expect(dateValue("not-a-date")).toBeNull();
  });
});

describe("isOpenTask", () => {
  it("treats complete/closed/cancelled statuses as not open", () => {
    expect(isOpenTask({ status: "In Progress" })).toBe(true);
    expect(isOpenTask({ status: "Not Started" })).toBe(true);
    expect(isOpenTask({ status: "Complete" })).toBe(false);
    expect(isOpenTask({ status: "Closed" })).toBe(false);
    expect(isOpenTask({ status: "Cancelled" })).toBe(false);
    expect(isOpenTask({})).toBe(true); // no status → open
  });
});

describe("isSummaryTask / isWorkTask", () => {
  it("flags summaries via is_summary / _hasChildren / parentIds, work otherwise", () => {
    expect(isSummaryTask({ is_summary: true })).toBe(true);
    expect(isSummaryTask({ _hasChildren: true })).toBe(true);
    expect(isSummaryTask({ id: "p1" }, new Set(["p1"]))).toBe(true);
    expect(isSummaryTask({ id: "x" })).toBe(false);
    expect(isWorkTask({ id: "x" })).toBe(true);
    expect(isWorkTask({ is_summary: true })).toBe(false);
  });
});

describe("taskOwner", () => {
  it("prefers resource_names, falls back to assigned_to, trims, empty default", () => {
    expect(taskOwner({ resource_names: "  Crew A " })).toBe("Crew A");
    expect(taskOwner({ assigned_to: "Sam" })).toBe("Sam");
    expect(taskOwner({})).toBe("");
  });
});

describe("daysFromToday", () => {
  it("returns whole-day deltas relative to today, null when unparseable", () => {
    expect(daysFromToday(daysOut(0))).toBe(0);
    expect(daysFromToday(daysOut(5))).toBe(5);
    expect(daysFromToday(daysOut(-3))).toBe(-3);
    expect(daysFromToday(null)).toBeNull();
  });
});

describe("taskName", () => {
  it("prefers task_name, then name, then title, then a fallback", () => {
    expect(taskName({ task_name: "A", name: "B" })).toBe("A");
    expect(taskName({ name: "B" })).toBe("B");
    expect(taskName({ title: "C" })).toBe("C");
    expect(taskName({})).toBe("Unnamed task");
  });
});

describe("phaseOf", () => {
  it("returns a known phase, else Unassigned", () => {
    expect(phaseOf({ phase: PHASES[0] })).toBe(PHASES[0]);
    expect(phaseOf({ phase: "Nonsense" })).toBe("Unassigned");
    expect(phaseOf({})).toBe("Unassigned");
  });
});

describe("dependencyIds / dependencyCount", () => {
  it("handles arrays, JSON strings, comma strings, and the predecessor aliases", () => {
    expect(dependencyIds({ dependencies: ["a", "b", null] })).toEqual(["a", "b"]);
    expect(dependencyIds({ predecessors: '["x","y"]' })).toEqual(["x", "y"]);
    expect(dependencyIds({ predecessor_ids: "p1, p2 , " })).toEqual(["p1", "p2"]);
    expect(dependencyIds({})).toEqual([]);
    expect(dependencyCount({ dependencies: ["a", "b"] })).toBe(2);
  });
});

describe("taskMetadata", () => {
  it("returns object metadata, parses JSON, and degrades to {}", () => {
    expect(taskMetadata({ metadata: { a: 1 } })).toEqual({ a: 1 });
    expect(taskMetadata({ metadata: '{"a":1}' })).toEqual({ a: 1 });
    expect(taskMetadata({ metadata: "broken{" })).toEqual({});
    expect(taskMetadata({})).toEqual({});
  });
});

describe("isCriticalTask", () => {
  it("reads metadata and top-level critical flags", () => {
    expect(isCriticalTask({ metadata: { is_critical: true } })).toBe(true);
    expect(isCriticalTask({ metadata: { critical_path: true } })).toBe(true);
    expect(isCriticalTask({ is_critical: true })).toBe(true);
    expect(isCriticalTask({})).toBe(false);
  });
});

describe("progressValue", () => {
  it("clamps to 0..100 and defaults non-finite to 0", () => {
    expect(progressValue({ percent_complete: 42 })).toBe(42);
    expect(progressValue({ percent_complete: 150 })).toBe(100);
    expect(progressValue({ percent_complete: -10 })).toBe(0);
    expect(progressValue({})).toBe(0);
  });
});

describe("taskDate", () => {
  it("prefers end_date, then start_date, then target_date, else null", () => {
    expect(taskDate({ end_date: "E", start_date: "S" })).toBe("E");
    expect(taskDate({ start_date: "S" })).toBe("S");
    expect(taskDate({ target_date: "T" })).toBe("T");
    expect(taskDate({})).toBeNull();
  });
});

describe("formatBriefTask", () => {
  it("composes name / phase / status / date into one line", () => {
    const out = formatBriefTask({ task_name: "Erect frame", phase: PHASES[0], status: "Open", end_date: "2026-06-24" });
    expect(out).toContain("Erect frame");
    expect(out).toContain(PHASES[0]);
    expect(out).toContain("Open");
  });
});

describe("formatAnalysisDate", () => {
  it("formats a date to a short, human label", () => {
    const out = formatAnalysisDate(new Date(2026, 5, 24));
    expect(out).toMatch(/Jun/);
    expect(out).toMatch(/2026/);
  });
});

describe("daysBetween", () => {
  it("checks whether a task field's day-delta is within [min,max]", () => {
    expect(daysBetween({ end_date: daysOut(3) }, "end_date", 0, 7)).toBe(true);
    expect(daysBetween({ end_date: daysOut(10) }, "end_date", 0, 7)).toBe(false);
    expect(daysBetween({ end_date: daysOut(-1) }, "end_date", 0, 7)).toBe(false);
    expect(daysBetween({}, "end_date", 0, 7)).toBe(false); // unparseable → null → false
  });
});

describe("shiftedByDays", () => {
  it("returns a non-negative shift, 0 for non-finite", () => {
    expect(shiftedByDays({ shiftedBy: 4 })).toBe(4);
    expect(shiftedByDays({ shiftedBy: -2 })).toBe(0);
    expect(shiftedByDays({})).toBe(0);
  });
});
