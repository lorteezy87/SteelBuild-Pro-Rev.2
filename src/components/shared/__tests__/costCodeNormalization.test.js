// Regression coverage for the cost-code matching inconsistency.
//
// getCostCodeSummary compared raw (`e.cost_code === costCode`) while
// getExpensesByCategory compared trimmed+stringified. A padded or numeric code
// therefore appeared in the category chart and vanished from the cost-code
// rollup, so the two views reported different totals from the same expenses.
// Both now go through normalizeCostCode().

import { describe, it, expect } from "vitest";
import {
  normalizeCostCode,
  getCostCodeSummary,
  getExpensesByCategory,
} from "../budgetCalculations";
import { COST_CODES } from "../costCodes";

const code = COST_CODES[0].code;
const category = COST_CODES[0].category;

describe("normalizeCostCode", () => {
  it("trims and stringifies", () => {
    expect(normalizeCostCode("  07 ")).toBe("07");
    expect(normalizeCostCode(7)).toBe("7");
  });

  it("treats null/undefined as empty", () => {
    expect(normalizeCostCode(null)).toBe("");
    expect(normalizeCostCode(undefined)).toBe("");
  });

  it("does NOT strip leading zeros — '01' and '1' are distinct codes", () => {
    expect(normalizeCostCode("01")).not.toBe(normalizeCostCode("1"));
  });
});

describe("cost-code matching is whitespace-tolerant", () => {
  const costCodes = [{ cost_code_number: code, budget_amount: 10000 }];

  it("counts an expense whose code carries stray whitespace", () => {
    const expenses = [{ cost_code: ` ${code} `, amount: 250, payment_status: "unpaid" }];
    const summary = getCostCodeSummary(code, [], expenses, costCodes);
    expect(summary.committed).toBe(250);
  });

  it("matches a padded cost_codes row against a clean lookup", () => {
    const summary = getCostCodeSummary(code, [], [], [
      { cost_code_number: `${code} `, budget_amount: 10000 },
    ]);
    expect(summary.budget).toBe(10000);
  });

  it("matches a padded SOV line", () => {
    const summary = getCostCodeSummary(code, [{ cost_code: `  ${code}`, scheduled_value: 5000 }], [], []);
    expect(summary.budget).toBe(5000);
  });
});

describe("rollup and category chart agree", () => {
  it("reports the same spend for a whitespace-padded expense", () => {
    const expenses = [{ cost_code: ` ${code} `, amount: 1234.56, payment_status: "unpaid" }];

    const rollup = getCostCodeSummary(code, [], expenses, [
      { cost_code_number: code, budget_amount: 5000 },
    ]);
    const byCategory = getExpensesByCategory(expenses);

    // Before the fix: rollup.committed was 0 while byCategory[category] was
    // 1234.56 — same data, two different answers.
    expect(rollup.committed).toBe(1234.56);
    expect(byCategory[category]).toBe(1234.56);
    expect(rollup.committed).toBe(byCategory[category]);
  });

  it("agrees that an unmatched code contributes nothing anywhere", () => {
    const expenses = [{ cost_code: "ZZ-not-a-code", amount: 900, payment_status: "unpaid" }];
    expect(getCostCodeSummary(code, [], expenses, []).committed).toBe(0);
    expect(getExpensesByCategory(expenses)[category]).toBe(0);
  });
});
