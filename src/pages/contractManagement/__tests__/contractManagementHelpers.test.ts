import { describe, expect, it } from "vitest";
import {
  pct,
  sumApprovedChangeOrders,
  sumPendingChangeOrders,
  sortChangeOrdersByNumber,
  sortSovByLineNumber,
  sumSovScheduledValue,
  sumSovBilledFromPercent,
} from "../contractManagementHelpers";

describe("pct", () => {
  it("clamps and handles zero denom", () => {
    expect(pct(50, 100)).toBe(50);
    expect(pct(0, 0)).toBe(0);
    expect(pct(200, 100)).toBe(100);
  });
});

describe("change order totals", () => {
  const cos = [
    { status: "Approved", co_amount: 1000, co_number: 2 },
    { status: " Approved ", co_amount: 500, co_number: 1 },
    { status: "Submitted", co_amount: 200, co_number: 3 },
    { status: "Rejected", co_amount: 999, co_number: 4 },
    { status: "Draft", co_amount: 50, co_number: 5 },
  ];

  it("sums only Approved co_amount", () => {
    expect(sumApprovedChangeOrders(cos)).toBe(1500);
  });

  it("sums pending as non-Approved/Rejected", () => {
    expect(sumPendingChangeOrders(cos)).toBe(250);
  });

  it("sorts by co_number", () => {
    expect(sortChangeOrdersByNumber(cos).map((c) => c.co_number)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("sov helpers", () => {
  const items = [
    { line_item_number: 2, scheduled_value: 200, current_percent_complete: 50 },
    { line_item_number: 1, scheduled_value: 100, current_percent_complete: 100 },
  ];

  it("sorts by line number", () => {
    expect(sortSovByLineNumber(items).map((i) => i.line_item_number)).toEqual([1, 2]);
  });

  it("sums scheduled and billed from percent", () => {
    expect(sumSovScheduledValue(items)).toBe(300);
    expect(sumSovBilledFromPercent(items)).toBe(200); // 100*1 + 200*0.5
  });
});
