import { describe, expect, it } from "vitest";
import {
  buildPpmProjectBands,
  ppmDateRange,
  ppmXFor,
  quartersBetween,
  truncateProjectName,
} from "../ppmRoadmapHelpers";

describe("ppmRoadmapHelpers", () => {
  it("builds phase-filtered bands sorted by start", () => {
    const bands = buildPpmProjectBands(
      [
        {
          id: "p2",
          name: "Beta",
          phase: "Fab",
          start_date: "2026-03-01",
          target_completion_date: "2026-09-01",
        },
        {
          id: "p1",
          name: "Alpha",
          phase: "Erect",
          start_date: "2026-01-01",
          target_completion_date: "2026-06-01",
        },
        {
          id: "p3",
          name: "No dates",
          phase: "Fab",
        },
      ],
      "all",
    );
    expect(bands.map((b) => b.id)).toEqual(["p1", "p2"]);
    expect(buildPpmProjectBands(bands, "Fab")).toHaveLength(1);
  });

  it("computes range, quarters, x mapping, truncation", () => {
    const bands = buildPpmProjectBands([
      {
        id: "p1",
        start_date: "2026-01-15",
        target_completion_date: "2026-07-01",
      },
    ]);
    const { rangeStart, rangeEnd } = ppmDateRange(bands);
    expect(rangeStart).toBeTruthy();
    expect(rangeEnd).toBeTruthy();
    const quarters = quartersBetween(rangeStart!, rangeEnd!);
    expect(quarters.length).toBeGreaterThanOrEqual(2);
    const totalMs = rangeEnd!.getTime() - rangeStart!.getTime();
    expect(
      ppmXFor({
        ts: rangeStart!.getTime(),
        rangeStart,
        totalMs,
        leftGutter: 220,
        innerW: 600,
      }),
    ).toBe(220);
    expect(truncateProjectName("Short")).toBe("Short");
    expect(truncateProjectName("A".repeat(30)).endsWith("…")).toBe(true);
  });
});
