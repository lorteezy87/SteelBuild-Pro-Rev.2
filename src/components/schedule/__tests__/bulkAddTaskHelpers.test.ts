import { describe, expect, it } from "vitest";
import { addDays, daysBetween, emptyBulkTaskRow, todayIso } from "../bulkAddTaskHelpers";

describe("bulk date helpers", () => {
  it("adds and diffs days in local YYYY-MM-DD", () => {
    expect(addDays("2026-01-01", 5)).toBe("2026-01-06");
    expect(daysBetween("2026-01-01", "2026-01-06")).toBe(5);
    expect(addDays(null, 1)).toBeNull();
    expect(daysBetween("", "2026-01-01")).toBeNull();
  });
});

describe("emptyBulkTaskRow", () => {
  it("seeds defaults", () => {
    const r = emptyBulkTaskRow(3);
    expect(r._id).toBe(3);
    expect(r.task_type).toBe("Task");
    expect(r.phase).toBe("Fabrication");
    expect(r.start_date).toBe(todayIso());
  });
});
