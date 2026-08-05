import { describe, expect, it } from "vitest";
import {
  avgAgeDays,
  ballInCourtSegments,
  rfisByMonth,
} from "../rfiInsightsHelpers";

describe("rfiInsightsHelpers", () => {
  it("avg age, BIC segments, month series", () => {
    const now = new Date("2026-08-05T12:00:00Z");
    expect(
      avgAgeDays(
        [
          { submitted_date: "2026-08-01" },
          { created_at: "2026-07-30" },
        ],
        now,
      ),
    ).toBeGreaterThan(0);

    const segs = ballInCourtSegments([
      { ball_in_court: "Architect" },
      { ball_in_court: "Architect" },
      { ball_in_court: null },
    ]);
    expect(segs.find((s) => s.label === "Architect")?.value).toBe(2);
    expect(segs.find((s) => s.label === "Internal")?.value).toBe(1);

    const months = rfisByMonth(
      [
        { submitted_date: "2026-08-02" },
        { submitted_date: "2026-07-15" },
        { submitted_date: "2025-01-01" },
      ],
      now,
    );
    expect(months).toHaveLength(6);
    expect(months.find((m) => m.key === "2026-08")?.value).toBe(1);
    expect(months.find((m) => m.key === "2026-07")?.value).toBe(1);
  });
});
