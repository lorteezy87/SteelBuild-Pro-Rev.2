import { describe, expect, it } from "vitest";
import {buildPayAppContract, findById, toFiniteNumber} from "../payApplicationsPageHelpers";

describe("payApplicationsPageHelpers", () => {
  it("builds contract from project + approved COs", () => {
    const contract = buildPayAppContract(
      { original_contract_value: 1000, retainage_percent: 10 },
      [
        { status: "Approved", co_amount: 100 },
        { status: "Draft", co_amount: 50 },
        { status: "approved", co_amount: 25 },
      ],
    );
    expect(contract.originalContractSum).toBe(1000);
    expect(contract.retainagePercent).toBe(10);
    expect(contract.netChangeOrders).toBe(125);
  });

  it("finds by id", () => {
    expect(findById([{ id: "a" }, { id: "b" }], "b")?.id).toBe("b");
    expect(findById([{ id: "a" }], null)).toBeNull();
  });
});

describe("toFiniteNumber", () => {
  it("coerces finite numbers and zeros the rest", () => {
    expect(toFiniteNumber("10")).toBe(10);
    expect(toFiniteNumber("x")).toBe(0);
    expect(toFiniteNumber(null)).toBe(0);
  });
});
