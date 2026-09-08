import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { isCriticalTask, isManuallyFlaggedCritical } from "../scheduleGanttHelpers";
import { computeFloat } from "@/services/scheduleFloat";

/**
 * Wiring cover for audit §2.2 / §7.3.
 *
 * The float calculation is only worth anything if the surfaces that CLAIM a
 * task is critical actually consume it. Before this batch they all read three
 * ORed manual flags, and the Rivet brief wrote prose off them — "directly
 * impacting the critical path" — which reads as analysis.
 */

const GANTT_SRC = readFileSync(new URL("../ScheduleGantt.jsx", import.meta.url), "utf8");
const ROWS_SRC = readFileSync(new URL("../GanttTaskRows.tsx", import.meta.url), "utf8");
const DERIVE_SRC = readFileSync(new URL("../scheduleGanttDerive.ts", import.meta.url), "utf8");
const ENGINE_SRC = readFileSync(new URL("../rivetBriefEngine.js", import.meta.url), "utf8");
const SCHEDULE_SRC = readFileSync(new URL("../../../pages/Schedule.tsx", import.meta.url), "utf8");

describe("isCriticalTask prefers the calculation", () => {
  const floats = computeFloat([
    { id: "A", start_date: "2026-03-02", end_date: "2026-03-05" },
    { id: "LONG", start_date: "2026-03-02", end_date: "2026-04-02" },
    {
      id: "END", start_date: "2026-04-02", end_date: "2026-04-03",
      dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 0 }, { id: "LONG", type: "FS", lag_days: 0 }]),
    },
  ]);

  it("overrides a ticked box when the calculation says there is float", () => {
    // The whole point: a box ticked months ago, before the dates moved.
    const flagged = { id: "A", is_critical: true };
    expect(isManuallyFlaggedCritical(flagged)).toBe(true);
    expect(floats.A.totalFloat).toBeGreaterThan(0);
    expect(isCriticalTask(flagged, floats)).toBe(false);
  });

  it("reports a calculated critical task that nobody ticked", () => {
    const unflagged = { id: "LONG" };
    expect(isManuallyFlaggedCritical(unflagged)).toBe(false);
    expect(isCriticalTask(unflagged, floats)).toBe(true);
  });

  it("falls back to the flag where float could not be calculated", () => {
    // A task with no dates, or inside a cycle, has no float. Returning false
    // would silently drop a hand-marked task off the CRITICAL filter; the flag
    // is the only signal left, so it is honoured.
    const undated = { id: "nope", is_critical: true };
    expect(isCriticalTask(undated, floats)).toBe(true);
    expect(isCriticalTask(undated, null)).toBe(true);
    expect(isCriticalTask(undated, undefined)).toBe(true);
  });

  it("still honours every legacy flag shape", () => {
    for (const flagged of [
      { id: "x", is_critical: true },
      { id: "x", is_critical_path: true },
      { id: "x", critical_path: true },
      { id: "x", metadata: { is_critical: true } },
      { id: "x", metadata: { critical_path: true } },
    ]) {
      expect(isManuallyFlaggedCritical(flagged)).toBe(true);
    }
  });
});

describe("the surfaces that claim 'critical' consume the calculation", () => {
  it("float is computed once for the WHOLE project, beside the cascade", () => {
    // Deriving it from the Gantt's phase-filtered rows would drop every
    // cross-phase predecessor and invent float that does not exist (§1.1).
    expect(SCHEDULE_SRC).toMatch(/computeFloat\(enrichedTasks, effectiveDatesMap, workingCalendar\)/);
  });

  it("both passes are handed the SAME working calendar", () => {
    // The forward pass snaps successor starts off weekends and counts lag in
    // working days; the backward pass has to use the same calendar or float
    // drifts from the bars by however many weekends a link spans (§2.1).
    expect(SCHEDULE_SRC).toMatch(/computeEffectiveDates\(enrichedTasks, workingCalendar\)/);
    expect(SCHEDULE_SRC).toMatch(/useProjectCalendar\(projectId\)/);
  });

  it("the Gantt tooltip, badges and phase counts pass floatMap", () => {
    expect(GANTT_SRC).toMatch(/isCriticalTask\(tooltip\.task, floatMap\)/);
    expect(ROWS_SRC).toMatch(/isCriticalTask\(task, floatMap\)/);
    expect(ROWS_SRC).toMatch(/isCriticalTask\(t, floatMap\)/);
  });

  it("the CRITICAL quick filter selects the real critical path", () => {
    expect(DERIVE_SRC).toMatch(/quickFilter === "critical"\) return isCriticalTask\(task, floatMap\)/);
  });

  it("no surface still calls isCriticalTask with the task alone", () => {
    // A bare call silently reverts that surface to the checkbox.
    for (const [name, src] of [["ScheduleGantt", GANTT_SRC], ["GanttTaskRows", ROWS_SRC], ["derive", DERIVE_SRC]] as const) {
      const bare = src.match(/isCriticalTask\(\s*\w+\s*\)/g) || [];
      expect(bare, `${name} has a flag-only critical check`).toEqual([]);
    }
  });
});

describe("the Rivet brief writes prose from the calculation", () => {
  it("runs the backward pass over the same forward-pass result", () => {
    // Recomputing the cascade separately would let the brief's claims describe
    // a different schedule from the bars beside them.
    expect(ENGINE_SRC).toMatch(/computeFloat\(storedTasks, effectiveDates\)/);
  });

  it("stamps the calculated answer onto each task", () => {
    expect(ENGINE_SRC).toMatch(/_is_critical_calculated: f\.isCritical/);
  });

  it("leaves a task unstamped when float could not be calculated", () => {
    // So isCriticalTask falls back to the flag rather than reporting "not
    // critical" for a task the calculation simply could not reach.
    const stamp = ENGINE_SRC.slice(ENGINE_SRC.indexOf("const floats = computeFloat"));
    expect(stamp.slice(0, 900)).toMatch(/f\.totalFloat !== null/);
  });
});
