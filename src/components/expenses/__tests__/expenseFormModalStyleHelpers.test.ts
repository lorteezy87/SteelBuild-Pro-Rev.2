import { describe, expect, it } from "vitest";
import {
  EXPENSE_TYPES,
  PAYMENT_STATUSES,
  UNITS,
  EMPTY_EXPENSE_FORM,
  iStyle,
} from "../expenseFormModalStyleHelpers";

describe("expenseFormModalStyleHelpers", () => {
  it("option lists and empty form", () => {
    expect(EXPENSE_TYPES).toContain("Labor");
    expect(PAYMENT_STATUSES).toContain("Unpaid");
    expect(UNITS).toContain("EA");
    expect(EMPTY_EXPENSE_FORM.expense_type).toBe("Materials");
    expect(iStyle.width).toBe("100%");
  });
});
