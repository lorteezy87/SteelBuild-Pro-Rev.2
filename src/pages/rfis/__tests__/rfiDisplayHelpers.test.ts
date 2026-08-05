import { describe, expect, it } from "vitest";
import {
  formatRfiDate,
  rfiImpactValue,
  rfiDueSummary,
  rfiImpactSummary,
} from "../utils";

describe("rfi display helpers", () => {
  it("formats dates with and without year", () => {
    expect(formatRfiDate(null)).toBe("No date");
    const short = formatRfiDate("2026-08-05");
    expect(short).toMatch(/Aug/);
    expect(short).not.toMatch(/2026/);
    const full = formatRfiDate("2026-08-05", { withYear: true });
    expect(full).toMatch(/2026/);
  });

  it("impact value and summaries", () => {
    expect(rfiImpactValue({ cost_impact: true, cost_impact_amount: 1500, schedule_impact: true, schedule_impact_days: 3 })).toContain("$1,500");
    expect(rfiImpactValue({})).toBe("No known impact");
    const due = rfiDueSummary({ date_required: null, submitted_date: "2026-08-01" } as any);
    expect(due.primary).toBe("No due date");
    const impact = rfiImpactSummary({
      cost_impact: true,
      cost_impact_amount: 100,
      metadata: { change_order_likely: true, fab_impact: true },
    });
    expect(impact.primary).toContain("$100");
    expect(impact.secondary).toContain("CO likely");
    expect(impact.live).toBe(true);
  });
});
