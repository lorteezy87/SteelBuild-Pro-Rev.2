import { describe, expect, it } from "vitest";
import { applyLineProgress, buildLinesFromSov, computeG702, lineFigures, lineRetainage } from "../g702";
import type { PayApplicationLine } from "../types";

const line = (over: Partial<PayApplicationLine> = {}): PayApplicationLine => ({
  scheduled_value: 50000, work_completed_previous: 0, work_completed_this_period: 0,
  materials_stored: 0, percent_complete: 0, retainage: 0, ...over,
});

describe("lineFigures (G703)", () => {
  it("G = D+E+F, H = C−G, % = G/C", () => {
    const f = lineFigures(line({ work_completed_previous: 10000, work_completed_this_period: 5000, materials_stored: 2500 }));
    expect(f.totalCompletedStored).toBe(17500); // G
    expect(f.balanceToFinish).toBe(32500); // H = 50000 − 17500
    expect(f.displayPercent).toBe(35); // 17500/50000
  });
});

describe("lineRetainage", () => {
  it("withholds retainage% of (completed + stored)", () => {
    expect(lineRetainage(line({ work_completed_this_period: 20000 }), 10)).toBe(2000);
    expect(lineRetainage(line({ work_completed_this_period: 20000, materials_stored: 5000 }), 10)).toBe(2500);
  });
});

describe("computeG702", () => {
  it("rolls up a full certificate that reconciles to the penny", () => {
    const lines = [
      line({ work_completed_this_period: 20000, retainage: 2000 }), // A: 40% of 50k
      line({ retainage: 0 }), // B: 0%
    ];
    const g = computeG702({
      contract: { originalContractSum: 100000, netChangeOrders: 10000, retainagePercent: 10 },
      lines,
      lessPreviousCertificates: 0,
    });
    expect(g.contractSumToDate).toBe(110000); // 1 + 2
    expect(g.totalCompletedStored).toBe(20000); // Σ G
    expect(g.totalRetainage).toBe(2000); // Σ I
    expect(g.totalEarnedLessRetainage).toBe(18000); // 4 − 5
    expect(g.currentPaymentDue).toBe(18000); // 6 − 7
    expect(g.balanceToFinish).toBe(92000); // 3 − 6
  });

  it("subtracts previous certificates for the current payment due", () => {
    const lines = [line({ work_completed_previous: 20000, work_completed_this_period: 15000, retainage: 3500 })];
    const g = computeG702({
      contract: { originalContractSum: 50000, netChangeOrders: 0, retainagePercent: 10 },
      lines,
      lessPreviousCertificates: 18000, // app 1 paid 18000
    });
    expect(g.totalCompletedStored).toBe(35000);
    expect(g.totalEarnedLessRetainage).toBe(31500); // 35000 − 3500
    expect(g.currentPaymentDue).toBe(13500); // 31500 − 18000
  });
});

describe("buildLinesFromSov", () => {
  it("creates one line per SOV item, carrying prior completed forward as 'previous'", () => {
    const sovItems = [
      { id: "s1", line_item_number: "1", description: "Mobilization", scheduled_value: 10000 },
      { id: "s2", line_item_number: "2", description: "Steel", scheduled_value: 90000 },
    ];
    const priorLines = [
      line({ sov_item_id: "s1", work_completed_previous: 4000, work_completed_this_period: 1000, materials_stored: 0 }),
    ];
    const built = buildLinesFromSov({ sovItems, priorLines, retainagePercent: 5 });
    expect(built).toHaveLength(2);
    // s1 previous = prior (D+E) = 5000; s2 has no prior → 0
    expect(built[0].work_completed_previous).toBe(5000);
    expect(built[0].percent_complete).toBe(50); // 5000/10000
    expect(built[1].work_completed_previous).toBe(0);
    expect(built[0].scheduled_value).toBe(10000);
  });
});

describe("applyLineProgress", () => {
  it("backs out this-period work from an entered total % and re-withholds retainage", () => {
    const l = line({ scheduled_value: 100000, work_completed_previous: 30000 }); // 30% prior
    const next = applyLineProgress(l, { percentComplete: 55 }, 10);
    expect(next.percent_complete).toBe(55);
    expect(next.work_completed_this_period).toBe(25000); // 55k earned − 30k previous
    expect(next.retainage).toBe(5500); // 10% of 55k completed
  });
  it("clamps percent to [0,100] and accepts stored materials", () => {
    const next = applyLineProgress(line({ scheduled_value: 1000 }), { percentComplete: 150, materialsStored: 200 }, 0);
    expect(next.percent_complete).toBe(100);
    expect(next.work_completed_this_period).toBe(1000);
    expect(next.materials_stored).toBe(200);
  });
});
