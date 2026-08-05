import { describe, expect, it } from "vitest";
import {
  quartersBetween,
  yearOptions,
  buildPhaseRangesByProject,
  collectPhaseRangeDates,
  resolveRoadmapRange,
  filterProjectsWithPhaseRanges,
  xForTimestamp,
} from "../roadmapHelpers";

describe("roadmapHelpers", () => {
  it("builds phase ranges and timeline geometry", () => {
    const ranges = buildPhaseRangesByProject(
      [
        { project_id: "p1", phase: "Detailing", start_date: "2026-01-01", end_date: "2026-03-01" },
        { project_id: "p1", phase: "Detailing", start_date: "2025-12-01", end_date: "2026-04-01" },
        { project_id: "p1", phase: "Nope", start_date: "2026-01-01", end_date: "2026-02-01" },
      ],
      ["Detailing", "Fabrication"],
    );
    expect(ranges.p1.Detailing.start).toBe(new Date("2025-12-01").getTime());
    expect(ranges.p1.Detailing.end).toBe(new Date("2026-04-01").getTime());
    const dates = collectPhaseRangeDates(ranges);
    expect(dates).toHaveLength(2);
    expect(yearOptions(dates)).toContain(2025);
    expect(yearOptions(dates)).toContain(2026);

    const auto = resolveRoadmapRange("auto", dates);
    expect(auto.rangeStart).toBeInstanceOf(Date);
    const y2026 = resolveRoadmapRange("2026", dates);
    expect(y2026.rangeStart?.getFullYear()).toBe(2026);

    expect(filterProjectsWithPhaseRanges([{ id: "p1" }, { id: "p2" }], ranges)).toHaveLength(1);
    const qs = quartersBetween(new Date(2026, 0, 1), new Date(2026, 11, 31));
    expect(qs.length).toBeGreaterThanOrEqual(4);
    expect(
      xForTimestamp(
        new Date(2026, 6, 1).getTime(),
        new Date(2026, 0, 1),
        new Date(2026, 11, 31),
        100,
        800,
      ),
    ).toBeGreaterThan(100);
  });
});

import {
  ROW_HEIGHT,
  HEADER_HEIGHT,
  LEFT_GUTTER,
  RIGHT_GUTTER,
  BAND_HEIGHT,
} from "../roadmapHelpers";

describe("roadmap layout sizes", () => {
  it("exports stable layout tokens", () => {
    expect(ROW_HEIGHT).toBe(48);
    expect(HEADER_HEIGHT).toBe(36);
    expect(LEFT_GUTTER).toBe(220);
    expect(RIGHT_GUTTER).toBe(16);
    expect(BAND_HEIGHT).toBe(14);
  });
});
