import { describe, it, expect } from "vitest";
import { buildBrief } from "../rivetBriefEngine";

/**
 * Regression cover for audit §1.2 — the Rivet brief computed the cascade and
 * then classified overdue / starts-soon / due-soon / active-now / stalled from
 * the STORED dates anyway, using the cascade only for its "shifted" narrative.
 *
 * So the brief could call a task overdue while its bar sat weeks in the future
 * on the Gantt beside it. buildBrief now overlays once at the top, and every
 * classification runs on effective dates.
 *
 * Dates are built relative to today because daysFromToday reads the real clock.
 * The vitest runner is pinned to TZ=UTC (vite.config.js) so these buckets are
 * deterministic.
 */

/** YYYY-MM-DD, `offset` days from today, in UTC. */
function day(offset) {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc.toISOString().slice(0, 10);
}

const ids = (tasks) => tasks.map((t) => t.id).sort();

/**
 * "Fabricate beams" is stored 10 days in the past — overdue on its stored
 * dates — but its predecessor doesn't finish for another 5 days, so the cascade
 * places it in the FUTURE. The Gantt draws it in the future. The brief must
 * agree.
 */
const HELD_BY_PREDECESSOR = [
  {
    id: "det-1",
    task_name: "Approve shop drawings",
    phase: "Detailing",
    status: "In Progress",
    start_date: day(-2),
    end_date: day(5),
  },
  {
    id: "fab-1",
    task_name: "Fabricate beams",
    phase: "Fabrication",
    status: "Not Started",
    start_date: day(-10),
    end_date: day(-10),
    dependencies: JSON.stringify([{ id: "det-1", type: "FS", lag_days: 1 }]),
  },
];

describe("buildBrief classifies from EFFECTIVE dates", () => {
  it("does not call a task overdue when the cascade has pushed it into the future", () => {
    const brief = buildBrief(HELD_BY_PREDECESSOR);
    expect(ids(brief.overdue)).not.toContain("fab-1");
  });

  it("still reports it as shifted, so the variance is not lost", () => {
    const brief = buildBrief(HELD_BY_PREDECESSOR);
    expect(ids(brief.shiftedTasks)).toContain("fab-1");
    expect(brief.totalShiftDays).toBeGreaterThan(0);
  });

  it("places it in the due-soon window its effective dates actually fall in", () => {
    // Effective finish is predecessor end (+5) + 1 lag = +6 days.
    const brief = buildBrief(HELD_BY_PREDECESSOR);
    expect(ids(brief.dueSoon)).toContain("fab-1");
  });

  it("does not call it stalled — it has not started because it CANNOT start yet", () => {
    // Stalled means "start date passed, zero progress". On stored dates fab-1
    // looked stalled by 10 days; it is simply waiting on its predecessor.
    const brief = buildBrief(HELD_BY_PREDECESSOR);
    expect(ids(brief.stalled)).not.toContain("fab-1");
  });

  it("a genuinely late task with no predecessor is still overdue", () => {
    // Guards against the fix over-reaching into "nothing is ever overdue".
    const brief = buildBrief([
      {
        id: "late-1",
        task_name: "Erect sequence 2",
        phase: "Erection",
        status: "Not Started",
        start_date: day(-20),
        end_date: day(-6),
      },
    ]);
    expect(ids(brief.overdue)).toContain("late-1");
  });
});

describe("the cascade-variance report still contrasts both windows", () => {
  it("prints the ORIGINAL stored dates, not the overlaid ones", () => {
    const brief = buildBrief(HELD_BY_PREDECESSOR);
    const line = brief.clipboardText
      .split("\n")
      .find((l) => l.includes("stored") && l.includes("Fabricate beams"));

    expect(line).toBeTruthy();
    // The whole point of this line is the contrast. If the overlay leaked into
    // it, both halves would read the same date and the report would be useless.
    expect(line).toContain("effective");
    const [storedHalf, effectiveHalf] = line.split("effective");
    expect(storedHalf).not.toEqual(effectiveHalf);
  });
});

describe("buildBrief fails loudly on bad input", () => {
  it("throws rather than returning an empty, falsely-reassuring brief", () => {
    // An empty brief renders as "On Track". Publishing false reassurance is the
    // most dangerous thing this component can do, so a bad caller must break.
    expect(() => buildBrief(undefined)).toThrow(TypeError);
    expect(() => buildBrief(null)).toThrow(/expects an array/);
    expect(() => buildBrief({})).toThrow(/expects an array/);
  });

  it("accepts a genuinely empty project", () => {
    expect(() => buildBrief([])).not.toThrow();
  });
});
