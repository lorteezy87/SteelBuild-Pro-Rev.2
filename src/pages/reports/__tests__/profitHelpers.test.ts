import { describe, expect, it } from "vitest";
import { buildProfitRows, filterProfitRows, sumProfitTotals } from "../profitHelpers";

describe("profitHelpers", () => {
  it("builds filters and totals margin rows", () => {
    const rows = buildProfitRows({
      projects: [
        { id: "p1", name: "Alpha", project_number: "A1", phase: "Fab", original_contract_value: 100 },
        { id: "p2", name: "Beta", project_number: "B1", phase: "Erection", original_contract_value: 200 },
      ],
      changeOrders: [
        { project_id: "p1", status: "Approved", co_amount: 10 },
        { project_id: "p1", status: "Draft", co_amount: 99 },
      ],
      expenses: [{ project_id: "p1" }],
      revisedContractValue: (p, cos) =>
        (Number(p.original_contract_value) || 0) +
        cos.filter((c) => c.status === "Approved").reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
      projectedFinalCost: () => 50,
    });
    expect(rows[0].approvedCOTotal).toBe(10);
    expect(rows[0].revised).toBe(110);
    expect(rows[0].profit).toBe(60);
    expect(filterProfitRows(rows, { search: "bet" })).toHaveLength(1);
    expect(filterProfitRows(rows, { phaseFilter: "Fab" })).toHaveLength(1);
    const totals = sumProfitTotals(rows);
    expect(totals.original).toBe(300);
    expect(totals.profit).toBe(60 + 150);
  });
});
