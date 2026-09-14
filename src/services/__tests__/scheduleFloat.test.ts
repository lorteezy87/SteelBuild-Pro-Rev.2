import { describe, it, expect } from "vitest";
import { makeCalendar, ALL_DAYS } from "@/lib/schedule/workingCalendar";
import {
  computeFloat,
  criticalTaskIds,
  criticalSource,
  formatFloat,
  describeFloat,
  NEAR_CRITICAL_DAYS,
} from "../scheduleFloat";

/**
 * Cover for audit §2.2 / §7.3 — "critical path" was a checkbox. Three manual
 * flags ORed together, no forward/backward pass, no float anywhere in the repo,
 * and the Rivet brief writing "directly impacting the critical path" off a box
 * someone ticked before the dates moved.
 *
 * These tests pin the CPM arithmetic against hand-worked examples. The backward
 * relations are the algebraic inverse of applyLink's forward ones, so if anyone
 * changes one without the other, the numbers below stop matching.
 *
 * Most run on a SEVEN-DAY calendar so the arithmetic is legible: on the default
 * Mon–Fri calendar every fixture spanning a weekend gains float from the
 * weekend rather than from its logic, which is correct behaviour but makes a
 * hand-worked CPM example impossible to read. The interaction between float and
 * the working calendar has its own describe block at the end.
 */

/** Seven-day: this module's math without weekend interference. */
const CAL7 = makeCalendar({ work_days: [...ALL_DAYS] });
const floatOf = (tasks: Record<string, unknown>[]) => computeFloat(tasks, null, CAL7);

const link = (id: string, type = "FS", lag_days = 0) => ({ id, type, lag_days });
const deps = (...links: ReturnType<typeof link>[]) => JSON.stringify(links);

describe("a simple chain", () => {
  /**
   *   A (3d) ──FS+0──▶ B (2d) ──FS+0──▶ C (2d)
   * Everything is in series, so nothing can slip: the chain IS the project.
   */
  const chain = [
    { id: "A", start_date: "2026-03-02", end_date: "2026-03-05" },
    { id: "B", start_date: "2026-03-05", end_date: "2026-03-07", dependencies: deps(link("A")) },
    { id: "C", start_date: "2026-03-07", end_date: "2026-03-09", dependencies: deps(link("B")) },
  ];

  it("every task on a single chain is critical with zero float", () => {
    const f = floatOf(chain);
    expect(f.A.totalFloat).toBe(0);
    expect(f.B.totalFloat).toBe(0);
    expect(f.C.totalFloat).toBe(0);
    expect(f.A.isCritical).toBe(true);
    expect(f.C.isCritical).toBe(true);
  });

  it("reports the whole chain as the critical path", () => {
    expect([...criticalTaskIds(floatOf(chain))].sort()).toEqual(["A", "B", "C"]);
  });
});

describe("a parallel branch carries float", () => {
  /**
   *            ┌── B (2d) ──┐
   *   A (3d) ──┤            ├──▶ D
   *            └── C (8d) ──┘
   *
   * C is six days longer than B, so C drives D and B has six days of float.
   * This is the case the checkbox could never know: B looks like ordinary work
   * and is safe to slip; C is not.
   */
  const diamond = [
    { id: "A", start_date: "2026-03-02", end_date: "2026-03-05" },
    { id: "B", start_date: "2026-03-05", end_date: "2026-03-07", dependencies: deps(link("A")) },
    { id: "C", start_date: "2026-03-05", end_date: "2026-03-13", dependencies: deps(link("A")) },
    { id: "D", start_date: "2026-03-13", end_date: "2026-03-16", dependencies: deps(link("B"), link("C")) },
  ];

  it("puts the long branch on the critical path and gives the short one float", () => {
    const f = floatOf(diamond);
    expect(f.C.totalFloat).toBe(0);
    expect(f.C.isCritical).toBe(true);
    expect(f.B.totalFloat).toBe(6);
    expect(f.B.isCritical).toBe(false);
  });

  it("the feeding and closing tasks are both critical", () => {
    const f = floatOf(diamond);
    expect(f.A.isCritical).toBe(true);
    expect(f.D.isCritical).toBe(true);
  });

  it("free float on the short branch is its slack to its OWN successor", () => {
    // B finishes 03-07, D starts 03-13 → 6 days before D is affected. Here it
    // equals total float; they diverge only in longer parallel chains.
    expect(floatOf(diamond).B.freeFloat).toBe(6);
  });
});

describe("free float vs total float", () => {
  /**
   *   A (2d) ──▶ B (2d) ──▶ D (2d)      ← this chain has slack as a WHOLE
   *   C (10d) ─────────────▶ D           ← C drives D
   *
   * A can slip 6 days before the project moves (total float 6) but only 0 days
   * before B — its own successor — moves. Reporting only total float would tell
   * a PM that A is safe to slip a week; it is not, not without moving B too.
   */
  const nested = [
    { id: "A", start_date: "2026-03-02", end_date: "2026-03-04" },
    { id: "B", start_date: "2026-03-04", end_date: "2026-03-06", dependencies: deps(link("A")) },
    { id: "C", start_date: "2026-03-02", end_date: "2026-03-12" },
    { id: "D", start_date: "2026-03-12", end_date: "2026-03-14", dependencies: deps(link("B"), link("C")) },
  ];

  it("total float measures slip against the project", () => {
    expect(floatOf(nested).A.totalFloat).toBe(6);
  });

  it("free float measures slip against the immediate successor", () => {
    const f = floatOf(nested);
    expect(f.A.freeFloat).toBe(0);
    expect(f.A.freeFloat).toBeLessThan(f.A.totalFloat!);
  });

  it("never publishes a free float greater than total float", () => {
    // Two derivations of the same slack; a contradiction here would be worse
    // than either number being slightly off.
    for (const v of Object.values(floatOf(nested))) {
      if (v.totalFloat !== null && v.freeFloat !== null) {
        expect(v.freeFloat).toBeLessThanOrEqual(v.totalFloat);
      }
    }
  });
});

describe("lag is respected", () => {
  it("FS lag consumes float", () => {
    // A finishes 03-05, B must wait 3 days, so B starts 03-08 at the earliest.
    const withLag = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-05" },
      { id: "B", start_date: "2026-03-08", end_date: "2026-03-10", dependencies: deps(link("A", "FS", 3)) },
    ];
    const f = floatOf(withLag);
    expect(f.A.totalFloat).toBe(0);
    expect(f.B.totalFloat).toBe(0);
  });
});

describe("link types other than FS", () => {
  it("SS: the successor is tied to the predecessor's START", () => {
    const ss = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-12" },
      { id: "B", start_date: "2026-03-04", end_date: "2026-03-06", dependencies: deps(link("A", "SS", 2)) },
    ];
    const f = floatOf(ss);
    // A is the long pole and drives the project finish.
    expect(f.A.isCritical).toBe(true);
    // B starts 2 days after A and finishes well before the project does.
    expect(f.B.totalFloat).toBeGreaterThan(0);
  });

  it("FF: the successor's FINISH is tied to the predecessor's", () => {
    const ff = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-06" },
      { id: "B", start_date: "2026-03-02", end_date: "2026-03-08", dependencies: deps(link("A", "FF", 2)) },
    ];
    const f = floatOf(ff);
    expect(f.A.totalFloat).toBe(0);
    expect(f.B.totalFloat).toBe(0);
  });
});

describe("what it refuses to guess", () => {
  it("returns nulls for a task with no dates rather than calling it critical", () => {
    // A TBD task with totalFloat 0 would be reported as on the critical path —
    // the exact class of false claim this replaces.
    const f = computeFloat([
      { id: "dated", start_date: "2026-03-02", end_date: "2026-03-05" },
      { id: "tbd", start_date: null, end_date: null },
    ]);
    expect(f.tbd.totalFloat).toBeNull();
    expect(f.tbd.isCritical).toBe(false);
    expect(describeFloat(f.tbd)).toMatch(/Not enough dates/);
  });

  it("marks cycle members instead of producing float for a loop", () => {
    const loop = [
      { id: "X", start_date: "2026-03-02", end_date: "2026-03-04", dependencies: deps(link("Y")) },
      { id: "Y", start_date: "2026-03-04", end_date: "2026-03-06", dependencies: deps(link("X")) },
    ];
    const f = floatOf(loop);
    expect(f.X.cycle).toBe(true);
    expect(f.X.totalFloat).toBeNull();
    expect(f.X.isCritical).toBe(false);
    expect(describeFloat(f.X)).toMatch(/predecessor cycle/);
  });

  it("ignores a link pointing at a deleted task", () => {
    // §1.6 orphans constrain nothing; treating one as a real edge would invent
    // float out of a link that stopped applying when its target was deleted.
    const orphaned = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-05", dependencies: deps(link("GONE")) },
    ];
    const f = floatOf(orphaned);
    expect(f.A.cycle).toBe(false);
    expect(f.A.totalFloat).toBe(0);
  });

  it("tolerates empty and null input", () => {
    expect(computeFloat([])).toEqual({});
    expect(computeFloat(null)).toEqual({});
    expect(criticalTaskIds(null).size).toBe(0);
  });

  it("returns unknowns when nothing in the project has a finish date", () => {
    const f = computeFloat([{ id: "A", start_date: null, end_date: null }]);
    expect(f.A.totalFloat).toBeNull();
  });
});

describe("near-critical", () => {
  it("flags the band where steel jobs get hurt, without calling it critical", () => {
    const near = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-04" },
      { id: "LONG", start_date: "2026-03-02", end_date: "2026-03-07" },
      { id: "END", start_date: "2026-03-07", end_date: "2026-03-09", dependencies: deps(link("A"), link("LONG")) },
    ];
    const f = floatOf(near);
    expect(f.A.totalFloat).toBe(3);
    expect(f.A.isNearCritical).toBe(true);
    expect(f.A.isCritical).toBe(false);
    expect(describeFloat(f.A)).toMatch(/Near critical/);
  });

  it("does not flag a task well clear of the threshold", () => {
    const slack = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-03" },
      { id: "LONG", start_date: "2026-03-02", end_date: "2026-04-02" },
      { id: "END", start_date: "2026-04-02", end_date: "2026-04-03", dependencies: deps(link("A"), link("LONG")) },
    ];
    const f = floatOf(slack);
    expect(f.A.totalFloat).toBeGreaterThan(NEAR_CRITICAL_DAYS);
    expect(f.A.isNearCritical).toBe(false);
  });
});

describe("criticalSource — a ticked box is not a calculation", () => {
  it("distinguishes calculated, manual, and both", () => {
    // §7.3 keeps the manual flag as an override, but a hand-ticked box and a
    // computed zero-float result are different claims and must not render
    // identically — that is how the old checkbox came to be trusted.
    const critical = { totalFloat: 0, isCritical: true } as never;
    const slack = { totalFloat: 9, isCritical: false } as never;

    expect(criticalSource(critical, false)).toBe("calculated");
    expect(criticalSource(slack, true)).toBe("manual");
    expect(criticalSource(critical, true)).toBe("both");
    expect(criticalSource(slack, false)).toBe("none");
    expect(criticalSource(null, false)).toBe("none");
  });
});

describe("formatFloat", () => {
  it("signs positive float and renders unknown as a dash", () => {
    expect(formatFloat({ totalFloat: 4 } as never)).toBe("+4d");
    expect(formatFloat({ totalFloat: 0 } as never)).toBe("0d");
    expect(formatFloat({ totalFloat: null } as never)).toBe("—");
    expect(formatFloat(null)).toBe("—");
  });
});

describe("float and the working calendar", () => {
  /**
   * A → B, FS+0. A finishes Friday 2026-03-06.
   *
   * On a seven-day calendar B can start Saturday. On Mon–Fri it cannot start
   * until Monday, so the same logic produces a later project finish — and A
   * gains the weekend as float against it.
   */
  const chain = [
    { id: "A", start_date: "2026-03-02", end_date: "2026-03-06" },
    {
      id: "B", start_date: "2026-03-06", end_date: "2026-03-10",
      dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 0 }]),
    },
  ];

  it("FS+0 off a Friday finish is unaffected — the end is exclusive", () => {
    // Worth pinning because it is the case that looks like it should move and
    // does not: `end` is the day AFTER the last worked day, so FS+0 lets the
    // successor start on that same date, and Friday is a working day.
    expect(floatOf(chain).A.totalFloat).toBe(computeFloat(chain).A.totalFloat);
  });

  it("FS+1 off a Friday finish starts Monday, not Saturday", () => {
    // THE §2.1 defect, as a float-level fact. A ends Friday 03-06; B is FS+1.
    // On a seven-day calendar B is pulled to Saturday 03-07. On Mon–Fri it
    // cannot start before Monday 03-09, so the project finishes two days later
    // and the backward pass has to agree — a lag counted in calendar days here
    // would place B's late start on the Saturday nobody works.
    const lagged = [
      { id: "A", start_date: "2026-03-02", end_date: "2026-03-06" },
      {
        id: "B", start_date: "2026-03-06", end_date: "2026-03-08",
        dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 1 }]),
      },
    ];
    expect(floatOf(lagged).B.lateStart).toBe("2026-03-07");   // Saturday
    expect(computeFloat(lagged).B.lateStart).toBe("2026-03-09"); // Monday
    // Both chains are fully driven, so B carries no float on either calendar —
    // the weekend moved the dates, not the slack.
    expect(floatOf(lagged).B.totalFloat).toBe(0);
    expect(computeFloat(lagged).B.totalFloat).toBe(0);
  });
});
