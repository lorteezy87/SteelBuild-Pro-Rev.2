import { describe, expect, it } from "vitest";
import { dueInfo, workdayDueInfo, workdaysUntil, dueInfoFor } from "../format";

// Phase 5: working-day-aware due display, used only when the
// `submittal_workday_dues` flag is on. `today` is injected so the assertions
// are deterministic (no dependence on the machine clock / timezone).

describe("workdaysUntil", () => {
  it("counts working days left, excluding weekends", () => {
    // today Mon Jul 6, due Mon Jul 13 → 5 working days.
    expect(workdaysUntil("2026-07-13", "2026-07-06")).toBe(5);
  });
  it("is negative when overdue in working days", () => {
    // today Mon Jul 6, due Fri Jul 3 → 1 working day late.
    expect(workdaysUntil("2026-07-03", "2026-07-06")).toBe(-1);
  });
  it("returns null for no/invalid date", () => {
    expect(workdaysUntil(null, "2026-07-06")).toBeNull();
    expect(workdaysUntil("", "2026-07-06")).toBeNull();
  });
});

describe("workdayDueInfo", () => {
  const today = "2026-07-06"; // Monday

  it("labels a closed item without touching dates", () => {
    const info = workdayDueInfo("2026-07-01", true, today);
    expect(info).toMatchObject({ label: "Closed", overdue: false, dueSoon: false });
  });

  it("labels 'No date' when there is no due date", () => {
    const info = workdayDueInfo(null, false, today);
    expect(info).toMatchObject({ label: "No date", days: null, overdue: false });
  });

  it("marks a past due date overdue in WORKING days", () => {
    // Fri Jul 3 is 1 working day before Mon Jul 6.
    const info = workdayDueInfo("2026-07-03", false, today);
    expect(info.overdue).toBe(true);
    expect(info.days).toBe(-1);
    expect(info.label).toBe("1d late");
  });

  it("labels 'Due today'", () => {
    const info = workdayDueInfo("2026-07-06", false, today);
    expect(info).toMatchObject({ label: "Due today", days: 0, dueSoon: true });
  });

  it("counts a Friday deadline as 4 working days out from Monday (not 4 calendar-inclusive)", () => {
    // Mon Jul 6 → Fri Jul 10 = 4 working days.
    const info = workdayDueInfo("2026-07-10", false, today);
    expect(info.days).toBe(4);
    expect(info.dueSoon).toBe(true);
    expect(info.label).toBe("4d left");
  });

  it("counts fewer days than the calendar span across a weekend", () => {
    // Mon Jul 6 → Mon Jul 13: calendar span = 7 days, working = 5 days. The
    // calendar-day dueInfo reads the machine clock (no injectable today), so we
    // assert the working-day count directly rather than against it.
    const wd = workdayDueInfo("2026-07-13", false, today);
    expect(wd.days).toBe(5);
    // A concrete demonstration the weekend was dropped: 7 calendar days minus
    // the two weekend days = 5 working days.
    expect(wd.days).toBeLessThan(7);
  });
});

describe("dueInfoFor dispatcher", () => {
  const today = "2026-07-06";
  it("uses calendar-day dueInfo when useWorkdays is false (default, flag off)", () => {
    const info = dueInfoFor("2026-07-13", { today });
    expect(info.days).toBe(dueInfo("2026-07-13").days); // 7
  });
  it("uses working-day dueInfo when useWorkdays is true (flag on)", () => {
    const info = dueInfoFor("2026-07-13", { useWorkdays: true, today });
    expect(info.days).toBe(5);
  });
});
