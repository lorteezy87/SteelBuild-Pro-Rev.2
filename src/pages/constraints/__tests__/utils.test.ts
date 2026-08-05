import { describe, expect, it } from "vitest";
import { abbreviateType, isOverdue, isResolved } from "../utils";

describe("constraints utils", () => {
  it("abbreviates and detects overdue/resolved", () => {
    expect(abbreviateType("IFC Hold")).toBe("IFC");
    expect(isResolved({ status: "Closed" })).toBe(true);
    expect(isOverdue({ due_date: "2020-01-01", status: "Open" })).toBe(true);
    expect(isOverdue({ due_date: "2020-01-01", status: "Resolved" })).toBe(false);
  });
});
