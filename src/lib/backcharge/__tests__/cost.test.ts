import { describe, expect, it } from "vitest";
import {
  computeBackchargeAmount,
  computeTmTicketTotal,
  rollupBackcharges,
  roundCurrency,
  sumTmTickets,
} from "../cost";
import type { Backcharge, TmTicket } from "../types";

const tm = (over: Partial<TmTicket> = {}): TmTicket =>
  ({ id: "t", backcharge_id: "b", project_id: "p", ...over } as TmTicket);

describe("computeTmTicketTotal", () => {
  it("is (hours×rate + equipment + material) × (1 + markup%)", () => {
    // (8 × 75 + 100 + 50) × 1.15 = (600 + 150) × 1.15 = 862.5
    expect(
      computeTmTicketTotal(tm({ labor_hours: 8, labor_rate: 75, equipment_cost: 100, material_cost: 50, markup_percent: 15 })),
    ).toBe(862.5);
  });
  it("defaults missing fields to 0 and rounds to cents", () => {
    expect(computeTmTicketTotal(tm({ labor_hours: 1, labor_rate: 33.333 }))).toBe(33.33);
    expect(computeTmTicketTotal(tm({}))).toBe(0);
  });
});

describe("sumTmTickets", () => {
  it("recomputes from inputs (ignores a drifted stored amount) and skips deleted", () => {
    const tickets = [
      tm({ labor_hours: 10, labor_rate: 50, amount: 99999 }), // 500 (stored 99999 ignored)
      tm({ material_cost: 250 }), // 250
      tm({ labor_hours: 5, labor_rate: 100, is_deleted: true }), // excluded
    ];
    expect(sumTmTickets(tickets)).toBe(750);
  });
  it("handles empty / null", () => {
    expect(sumTmTickets([])).toBe(0);
    expect(sumTmTickets(null)).toBe(0);
  });
});

describe("computeBackchargeAmount", () => {
  it("is the greater of the header amount and the T&M total", () => {
    expect(computeBackchargeAmount({ amount: 2000 } as Backcharge, [tm({ material_cost: 500 })])).toBe(2000);
    expect(computeBackchargeAmount({ amount: 100 } as Backcharge, [tm({ material_cost: 500 })])).toBe(500);
  });
});

describe("rollupBackcharges", () => {
  it("splits open vs collected exposure and groups by status", () => {
    const bcs = [
      { id: "1", project_id: "p", status: "notice_sent", amount: 1000, title: "a" },
      { id: "2", project_id: "p", status: "disputed", amount: 500, title: "b" },
      { id: "3", project_id: "p", status: "collected", amount: 2000, title: "c" },
      { id: "4", project_id: "p", status: "void", amount: 999, title: "d", is_deleted: true },
    ] as Backcharge[];
    const r = rollupBackcharges(bcs);
    expect(r.count).toBe(3); // deleted excluded
    expect(r.open).toBe(1500); // notice_sent + disputed
    expect(r.collected).toBe(2000);
    expect(r.total).toBe(3500);
    expect(r.byStatus.notice_sent).toEqual({ count: 1, amount: 1000 });
  });
});

describe("roundCurrency", () => {
  it("rounds half up at the cent boundary", () => {
    expect(roundCurrency(862.495)).toBe(862.5);
    expect(roundCurrency(0.005)).toBe(0.01);
  });
});
