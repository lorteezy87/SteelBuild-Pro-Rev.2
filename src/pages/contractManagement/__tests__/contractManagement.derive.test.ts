import { describe, expect, it } from "vitest";
import {
  CONTRACT_TABS,
  createContractEditForm,
  createContractUpdatePayload,
  deriveBillingSov,
  deriveChangeOrders,
  deriveContractPageFinancials,
  deriveContractSummary,
  type ContractChangeOrder,
  type ContractExpense,
  type ContractProject,
  type ContractSovItem,
} from "../contractManagement.derive";

const project = {
  id: "project-1",
  original_contract_value: 100_000,
  contract_type: "Lump Sum",
} as ContractProject;

const changeOrders = [
  { id: "co-3", co_number: 3, co_amount: 5_000, status: "Rejected" },
  { id: "co-1", co_number: 1, co_amount: 25_000, status: " Approved " },
  { id: "co-2", co_number: 2, co_amount: 10_000, status: "Under Review" },
] as ContractChangeOrder[];

describe("contract management derivations", () => {
  it("preserves change-order sorting, status buckets, and revised value", () => {
    const derived = deriveChangeOrders(changeOrders);
    expect(derived.rows.map((row) => row.id)).toEqual(["co-1", "co-2", "co-3"]);
    expect(derived.totals).toEqual({
      total: 3,
      approved: 25_000,
      pending: 10_000,
      rejected: 5_000,
      rejectedCount: 1,
    });
    expect(deriveContractPageFinancials(project, changeOrders)).toEqual({
      originalValue: 100_000,
      approvedCOTotal: 25_000,
      pendingCOTotal: 10_000,
      revisedValue: 125_000,
    });
  });

  it("preserves billing clamps, retainage, balances, and expense totals", () => {
    const sovItems = [
      {
        id: "line-2",
        line_item_number: 2,
        scheduled_value: 50_000,
        current_percent_complete: 120,
        retainage_percent: 10,
      },
      {
        id: "line-1",
        line_item_number: 1,
        scheduled_value: 100_000,
        current_percent_complete: -10,
        retainage_percent: 5,
      },
    ] as ContractSovItem[];
    const expenses = [
      { id: "expense-1", amount: 4_000 },
      { id: "expense-2", amount: null },
    ] as ContractExpense[];

    const derived = deriveBillingSov(sovItems, expenses);
    expect(derived.rows.map(({ item }) => item.id)).toEqual(["line-1", "line-2"]);
    expect(derived.rows[0]).toMatchObject({
      percentComplete: 0,
      billedAmount: 0,
      retainageAmount: 0,
      balance: 100_000,
    });
    expect(derived.rows[1]).toMatchObject({
      percentComplete: 100,
      billedAmount: 50_000,
      retainageAmount: 5_000,
      balance: 0,
    });
    expect(derived.totals).toEqual({
      scheduled: 150_000,
      billed: 50_000,
      retainage: 5_000,
      netReceived: 45_000,
      totalExpenses: 4_000,
    });
  });

  it("uses canonical deduped SOV rollups in contract health", () => {
    const sovItems = [
      {
        id: "line-1-app-1",
        line_item_number: 1,
        application_number: 1,
        scheduled_value: 125_000,
        current_percent_complete: 20,
        status: "Certified",
      },
      {
        id: "line-1-app-2",
        line_item_number: 1,
        application_number: 2,
        scheduled_value: 125_000,
        current_percent_complete: 40,
        status: "Certified",
      },
    ] as ContractSovItem[];

    const summary = deriveContractSummary(project, changeOrders, sovItems, 125_000);
    expect(summary.sovTotal).toBe(125_000);
    expect(summary.billedTotal).toBe(50_000);
    expect(summary.sovMismatchPct).toBe(0);
    expect(summary.billingProgress).toBe(40);
    expect(summary.healthItems).toEqual([
      expect.objectContaining({ label: "SOV vs Contract Alignment", tone: "success" }),
      expect.objectContaining({ label: "Billing Progress", tone: "warning" }),
      expect.objectContaining({ label: "Outstanding Change Orders", tone: "warning" }),
    ]);
  });

  it("preserves contract form null and numeric payload semantics", () => {
    expect(createContractEditForm(project)).toEqual({
      original_contract_value: 100_000,
      contract_type: "Lump Sum",
    });
    expect(
      createContractUpdatePayload({
        original_contract_value: "not-a-number",
        contract_type: "",
      }),
    ).toEqual({
      original_contract_value: 0,
      contract_type: null,
    });
    expect(CONTRACT_TABS).toEqual([
      "CHANGE ORDERS",
      "BILLING & SOV",
      "CONTRACT SUMMARY",
    ]);
  });
});
