import { describe, expect, it } from "vitest";
import { extractDetails } from "../itemDetailDrawerHelpers";

describe("extractDetails", () => {
  it("includes common fields and project label", () => {
    const rows = extractDetails({
      itemType: "RFI",
      urgency: "overdue",
      displayStatus: "Open",
      owner: "Alex",
      projectNumber: "2401",
      projectName: "Tower",
      priority: "High",
      raw: {
        date_required: "2026-07-01",
        question: "x".repeat(400),
        cost_impact_amount: 1500,
        schedule_impact_days: 3,
      },
    });
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel.Type).toBe("RFI");
    expect(byLabel.Project).toBe("2401 — Tower");
    expect(byLabel["Cost Impact"]).toBe("$1,500");
    expect(byLabel.Question).toHaveLength(300);
  });

  it("handles DEL and PAY type-specific rows", () => {
    const del = extractDetails({
      itemType: "DEL",
      urgency: "normal",
      status: "In Transit",
      raw: { weight_tons: 12.34, pieces: 4, scheduled_date: "2026-08-01" },
    });
    expect(del.find((r) => r.label === "Weight")?.value).toBe("12.3T");
    const pay = extractDetails({
      itemType: "PAY",
      urgency: "normal",
      status: "Draft",
      raw: { totalBilled: 1234.5, totalScheduled: 5000, period_to: "2026-07-31" },
    });
    expect(pay.find((r) => r.label === "Billed to Date")?.value).toBe("$1,235");
  });
});
