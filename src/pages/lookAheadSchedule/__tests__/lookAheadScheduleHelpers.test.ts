import { describe, expect, it } from "vitest";
import {buildWpLabelById,
  groupLookAheadItems,
  computeLookAheadStats,
  buildRfisById, buildLookAheadWindow, formatLookAheadWindowDate} from "../lookAheadScheduleHelpers";

describe("lookAheadScheduleHelpers", () => {
  it("builds wp labels", () => {
    expect(buildWpLabelById([{ id: "1", wp_number: "WP-1", name: "Anchors" }])["1"]).toBe("WP-1");
  });

  it("groups by phase/project/crew", () => {
    const items = [
      { phase: "Detailing", project_name: "A", crew: "C1" },
      { phase: "Erection", project_name: "A", crew: "C2" },
      { phase: "Erection", project_name: "B", crew: null },
    ];
    const byPhase = groupLookAheadItems(items, "Phase");
    expect(byPhase.groupKeys).toEqual(["Detailing", "Fabrication", "Delivery", "Erection"]);
    expect(byPhase.itemsByGroup.get("Erection")).toHaveLength(2);

    const byCrew = groupLookAheadItems(items, "Crew");
    expect(byCrew.itemsByGroup.get("No Crew")).toHaveLength(1);
  });

  it("computes stats", () => {
    const stats = computeLookAheadStats([
      { status: "In Progress", percent_complete: 50 },
      { status: "Complete", percent_complete: 100 },
      { status: "Delayed", percent_complete: 10 },
    ]);
    expect(stats).toEqual({ total: 3, inProgress: 1, complete: 1, delayed: 1, avgProgress: 53 });
  });

  it("builds rfi id map", () => {
    expect(buildRfisById([{ id: "r1", title: "A" }]).r1.title).toBe("A");
  });
});

describe("buildLookAheadWindow", () => {
  it("shifts 14-day windows by offset", () => {
    const now = new Date("2026-08-05T12:00:00");
    const w0 = buildLookAheadWindow(0, now);
    const w1 = buildLookAheadWindow(1, now);
    expect(w0.end.getTime() - w0.start.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(w1.start.getDate()).toBe(w0.end.getDate());
    expect(formatLookAheadWindowDate(w0.start)).toMatch(/2026/);
  });
});

import { lookAheadCommandSubtitle } from "../lookAheadScheduleHelpers";

describe("lookAheadCommandSubtitle", () => {
  it("joins formatted window", () => {
    const a = new Date("2026-06-01");
    const b = new Date("2026-06-14");
    expect(lookAheadCommandSubtitle(a, b, (d) => d.toISOString().slice(0, 10))).toBe(
      "2026-06-01 – 2026-06-14",
    );
  });
});
