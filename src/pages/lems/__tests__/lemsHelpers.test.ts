import { describe, expect, it } from "vitest";
import {
  safeNum,
  fmt,
  fmtDec,
  pct,
  burnTone,
  computeLaborStats,
  mapLaborWpRows,
  parseEquipmentEntry,
  aggregateEquipmentFromLogs,
  computeMaterialsStats,
  mapDeliveryRows,
} from "../lemsHelpers";

describe("lemsHelpers", () => {
  it("safeNum/fmt/fmtDec/pct/burnTone", () => {
    expect(safeNum("12.5")).toBe(12.5);
    expect(safeNum("x")).toBe(0);
    expect(fmt(1000)).toMatch(/1,000|1000/);
    expect(fmtDec(12.345, 1)).toMatch(/12\.3/);
    expect(pct(50, 100)).toBe(50);
    expect(pct(10, 0)).toBe(0);
    expect(burnTone(110)).toBe("var(--status-error)");
    expect(burnTone(90)).toBe("var(--status-warning)");
    expect(burnTone(50)).toBe("var(--text-primary)");
  });

  it("computes labor stats and wp rows", () => {
    const wps = [
      {
        shop_hours_budget: 100,
        shop_hours_actual: 80,
        field_hours_budget: 50,
        field_hours_actual: 60,
      },
    ];
    const logs = [
      { headcount: 2, hours_worked: 20 },
      { headcount: 4, hours_worked: 32 },
    ];
    const stats = computeLaborStats(wps, logs);
    expect(stats.totalBudget).toBe(150);
    expect(stats.totalActual).toBe(140);
    expect(stats.burnPct).toBeCloseTo((140 / 150) * 100);
    expect(stats.avgHeadcount).toBe(3);
    // OT: day1 regular cap 16, worked 20 → 4; day2 cap 32, worked 32 → 0
    expect(stats.overtimeHrs).toBe(4);

    const rows = mapLaborWpRows(wps);
    expect(rows[0].burn).toBeCloseTo((140 / 150) * 100);
    expect(rows[0].variance).toBe(10);
  });

  it("parses equipment entries and aggregates logs", () => {
    expect(parseEquipmentEntry("2x Crane")).toEqual({ type: "Crane", qty: 2 });
    expect(parseEquipmentEntry("Forklift x3")).toEqual({ type: "Forklift", qty: 3 });
    expect(parseEquipmentEntry("Manlift (2)")).toEqual({ type: "Manlift", qty: 2 });
    expect(parseEquipmentEntry("welder")).toEqual({ type: "Welder", qty: 1 });

    const data = aggregateEquipmentFromLogs([
      { equipment_used: "2x Crane, Welder", date: "2026-01-02" },
      { equipment_used: "Crane", date: "2026-01-03" },
      { equipment_used: "", date: "2026-01-04" },
    ]);
    expect(data[0].type).toBe("Crane");
    expect(data[0].daysUsed).toBe(2);
    expect(data.find((e) => e.type === "Welder")?.daysUsed).toBe(1);
  });

  it("computes materials stats and late deliveries", () => {
    const stats = computeMaterialsStats(
      [{ tonnage: 100 }],
      [
        { status: "Delivered", weight_tons: 40, pieces: 10 },
        { status: "In Transit", weight_tons: 20, pieces: 5 },
      ],
    );
    expect(stats.totalTonnage).toBe(100);
    expect(stats.deliveredTonnage).toBe(40);
    expect(stats.remaining).toBe(60);
    expect(stats.deliveryPct).toBe(40);
    expect(stats.deliveredPieces).toBe(10);

    const now = new Date("2026-06-01T12:00:00");
    const rows = mapDeliveryRows(
      [
        { status: "In Transit", scheduled_date: "2026-05-01" },
        { status: "Delivered", scheduled_date: "2026-05-01" },
        { status: "In Transit", scheduled_date: "2026-07-01" },
      ],
      now,
    );
    expect(rows[0].isLate).toBe(true);
    expect(rows[1].isLate).toBe(false);
    expect(rows[2].isLate).toBe(false);
  });
});
