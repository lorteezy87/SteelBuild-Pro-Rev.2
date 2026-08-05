import { describe, expect, it } from "vitest";
import {
  isoWeekKey,
  lastNWeekKeys,
  buildWeeklyCostMatrix,
  buildWeeklyActivityMatrix,
  formatWeekLabel,
} from "../weeklyReportHelpers";

describe("weeklyReportHelpers", () => {
  it("iso week keys and windows", () => {
    const k = isoWeekKey(new Date(2026, 7, 5)); // Wed Aug 5 2026
    expect(k).toMatch(/^2026-W\d{2}$/);
    const keys = lastNWeekKeys(4, new Date(2026, 7, 5));
    expect(keys).toHaveLength(4);
    expect(formatWeekLabel(keys[0])).toMatch(/[A-Za-z]/);
  });

  it("builds cost and activity matrices", () => {
    const weekKeys = lastNWeekKeys(2, new Date(2026, 7, 5));
    const cost = buildWeeklyCostMatrix(
      [
        {
          expense_date: "2026-08-04",
          cost_code_name: "Steel",
          amount: 100,
          payment_status: "Paid",
        },
        {
          expense_date: "2026-08-04",
          cost_code_name: "Steel",
          amount: 50,
          payment_status: "Voided",
        },
        {
          expense_date: "2020-01-01",
          cost_code_name: "Old",
          amount: 999,
          payment_status: "Paid",
        },
      ],
      weekKeys,
    );
    expect(cost.categories).toContain("Steel");
    const steelTotal = weekKeys.reduce((s, k) => s + (cost.matrix[k].Steel || 0), 0);
    expect(steelTotal).toBe(100);

    const act = buildWeeklyActivityMatrix(
      [
        { created_at: "2026-08-04T12:00:00Z", event_type: "upload" },
        { created_at: "2026-08-04T13:00:00Z", event_type: "upload" },
        { created_at: "2026-08-03T13:00:00Z", event_type: "comment" },
      ],
      weekKeys,
    );
    expect(act.eventTypes).toEqual(expect.arrayContaining(["upload", "comment"]));
    const uploads = weekKeys.reduce((s, k) => s + (act.matrix[k].upload || 0), 0);
    expect(uploads).toBe(2);
  });
});
