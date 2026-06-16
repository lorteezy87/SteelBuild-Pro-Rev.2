import { describe, it, expect } from "vitest";
import { isOverdue, daysLate } from "../drawingsUtils";

const PAST = "2020-01-01";
const FUTURE = "2999-01-01";

describe("isOverdue", () => {
  it("flags a past-due sheet that is still active", () => {
    expect(isOverdue({ due_date: PAST, stage: "IFC" })).toBe(true);
  });

  it("is not overdue without a due date, or when due in the future", () => {
    expect(isOverdue({ stage: "IFC" })).toBe(false);
    expect(isOverdue({ due_date: FUTURE, stage: "IFC" })).toBe(false);
  });

  it("never flags a done/inactive sheet, even if past due (the 'good sets light up red' fix)", () => {
    expect(isOverdue({ due_date: PAST, stage: "Released" })).toBe(false);
    expect(isOverdue({ due_date: PAST, stage: "IFC", is_superseded: true })).toBe(false);
    expect(isOverdue({ due_date: PAST, stage: "IFC", set_approval_status: "approved" })).toBe(false);
  });
});

describe("daysLate", () => {
  it("is 0 when not overdue and positive when genuinely late", () => {
    expect(daysLate({ due_date: FUTURE, stage: "IFC" })).toBe(0);
    expect(daysLate({ due_date: PAST, stage: "IFC" })).toBeGreaterThan(0);
    expect(daysLate({ due_date: PAST, stage: "Released" })).toBe(0); // done = not late
  });
});
