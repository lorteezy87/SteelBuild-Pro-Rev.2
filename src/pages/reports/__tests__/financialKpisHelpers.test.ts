import { describe, expect, it } from "vitest";
import {
  trafficLight,
  healthColor,
  latestCertifiedPerLineItem,
  buildProjectFinancialMetrics,
  filterFinancialProjectMetrics,
  aggregateFinancialKpis,
} from "../financialKpisHelpers";

describe("financialKpisHelpers", () => {
  it("traffic light and health color", () => {
    expect(trafficLight(null as any, { green: [0, 85], amber: [85.01, 95] })).toBe("neutral");
    expect(trafficLight(50, { green: [0, 85], amber: [85.01, 95] })).toBe("good");
    expect(trafficLight(90, { green: [0, 85], amber: [85.01, 95] })).toBe("watch");
    expect(trafficLight(99, { green: [0, 85], amber: [85.01, 95] })).toBe("risk");
    expect(healthColor("good", { good: "green" })).toBe("green");
    expect(healthColor("nope", {})).toBe("var(--text-muted)");
  });

  it("latest certified per line prefers higher application number", () => {
    const rows = latestCertifiedPerLineItem([
      { project_id: "p1", line_item_number: 1, application_number: 1, status: "Certified", scheduled_value: 100, current_percent_complete: 50 },
      { project_id: "p1", line_item_number: 1, application_number: 2, status: "Paid", scheduled_value: 100, current_percent_complete: 80 },
      { project_id: "p1", line_item_number: 1, application_number: 3, status: "Draft", scheduled_value: 100, current_percent_complete: 100 },
      { project_id: "p1", line_item_number: 2, application_number: 1, status: "Certified", scheduled_value: 200, current_percent_complete: 10 },
    ]);
    expect(rows).toHaveLength(2);
    const line1 = rows.find((r) => r.line_item_number === 1)!;
    expect(line1.application_number).toBe(2);
    expect(line1.current_percent_complete).toBe(80);
  });

  it("build metrics, filter, aggregate", () => {
    const metrics = buildProjectFinancialMetrics({
      projects: [{ id: "p1", name: "Alpha", project_number: "A1", phase: "Fab", health_status: "On Track" }],
      workPackages: [{ project_id: "p1" }],
      changeOrders: [],
      expenses: [
        { project_id: "p1", payment_status: "Paid", amount: 40 },
        { project_id: "p1", payment_status: "Unpaid", amount: 60 },
        { project_id: "p1", payment_status: "Voided", amount: 999 },
      ],
      sovItems: [
        {
          project_id: "p1",
          line_item_number: 1,
          application_number: 1,
          status: "Certified",
          scheduled_value: 200,
          current_percent_complete: 50,
          retainage_percent: 10,
          payment_received_date: "2026-07-01",
          submitted_date: "2026-06-01",
        },
      ],
      calcContractValue: () => ({
        original: 1000,
        revised: 1100,
        approvedCOTotal: 100,
        pendingCOValue: 0,
      }),
      calcEVM: () => ({ cpi: 1.0, spi: 0.9, eac: 1000, vac: 0, bac: 1000, ev: 500, ac: 500 }),
      calcWpProgress: () => ({ pct: 50 }),
      calcLaborBurn: () => ({ burnPct: 40 }),
    });
    expect(metrics).toHaveLength(1);
    expect(metrics[0].committed).toBe(100);
    expect(metrics[0].paid).toBe(40);
    expect(metrics[0].billed).toBe(100); // 200 * 50%
    expect(metrics[0].collected).toBe(100);
    expect(metrics[0].retention).toBe(10);
    expect(metrics[0].avgDSO).toBe(30);

    expect(filterFinancialProjectMetrics(metrics, "alp")).toHaveLength(1);
    expect(filterFinancialProjectMetrics(metrics, "zzz")).toHaveLength(0);

    const agg = aggregateFinancialKpis(metrics);
    expect(agg.totalRevised).toBe(1100);
    expect(agg.totalCommitted).toBe(100);
    expect(agg.portfolioCPI).toBe(1);
    expect(agg.avgDSO).toBe(30);
  });
});
