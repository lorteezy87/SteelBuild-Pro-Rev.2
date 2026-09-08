/**
 * scheduleCascade.test.js
 *
 * Regression bar: legacy FS+1 behaviour (the previous inline cascade in
 * ScheduleGantt) must produce the same effective windows after the
 * extraction. Plus link-type semantics, lag (positive + negative), and
 * cycle handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseDependencies,
  serializeDependencies,
  computeEffectiveDates,
  applyEffectiveDates,
  LINK_TYPES,
} from "../scheduleCascade";

// ── parseDependencies ──────────────────────────────────────────────────

describe("parseDependencies", () => {
  it("returns [] for falsy / empty inputs", () => {
    expect(parseDependencies(null)).toEqual([]);
    expect(parseDependencies(undefined)).toEqual([]);
    expect(parseDependencies("")).toEqual([]);
    expect(parseDependencies("null")).toEqual([]);
    expect(parseDependencies("[]")).toEqual([]);
  });

  it("normalises legacy id-string array to FS+1", () => {
    expect(parseDependencies('["a","b"]')).toEqual([
      { id: "a", type: "FS", lag_days: 1 },
      { id: "b", type: "FS", lag_days: 1 },
    ]);
  });

  it("accepts already-parsed array of objects", () => {
    const arr = [
      { id: "a", type: "SS", lag_days: 0 },
      { id: "b", type: "FF", lag_days: -2 },
    ];
    expect(parseDependencies(arr)).toEqual(arr);
  });

  it("accepts JSON-stringified array of objects", () => {
    const json = JSON.stringify([{ id: "a", type: "FS", lag_days: 3 }]);
    expect(parseDependencies(json)).toEqual([
      { id: "a", type: "FS", lag_days: 3 },
    ]);
  });

  it("coerces unknown link type to FS and bad lag to 1", () => {
    expect(
      parseDependencies([{ id: "a", type: "ZZ", lag_days: "garbage" }])
    ).toEqual([{ id: "a", type: "FS", lag_days: 1 }]);
  });

  it("drops elements without an id", () => {
    expect(
      parseDependencies([{ type: "FS", lag_days: 1 }, "valid"])
    ).toEqual([{ id: "valid", type: "FS", lag_days: 1 }]);
  });

  it("returns [] for malformed JSON without throwing", () => {
    expect(parseDependencies("not-json")).toEqual([]);
    expect(parseDependencies("{not:array}")).toEqual([]);
  });
});

// ── serializeDependencies ──────────────────────────────────────────────

describe("serializeDependencies", () => {
  it("returns null for empty input", () => {
    expect(serializeDependencies([])).toBeNull();
    expect(serializeDependencies(null)).toBeNull();
  });

  it("round-trips through parseDependencies", () => {
    const orig = [
      { id: "a", type: "SS", lag_days: 2 },
      { id: "b", type: "FS", lag_days: 0 },
    ];
    const json = serializeDependencies(orig);
    expect(parseDependencies(json)).toEqual(orig);
  });

  it("throws on unrecognised link type", () => {
    expect(() => serializeDependencies([{ id: "a", type: "QQ" }])).toThrow();
  });

  it("coerces non-integer lag to FS+1 default", () => {
    const json = serializeDependencies([
      { id: "a", type: "FS", lag_days: 2.7 },
    ]);
    expect(parseDependencies(json)).toEqual([
      { id: "a", type: "FS", lag_days: 2 },
    ]);
  });
});

// ── computeEffectiveDates ──────────────────────────────────────────────

describe("computeEffectiveDates — FS+1 regression bar", () => {
  it("matches the legacy inline cascade for unmigrated id-string deps", () => {
    // Legacy: A finishes 2026-05-01, B should auto-start 2026-05-02 with
    // its current 3-day duration preserved.
    const tasks = [
      { id: "A", start_date: "2026-04-25", end_date: "2026-05-01" },
      {
        id: "B",
        start_date: "2026-04-20",
        end_date: "2026-04-23",
        dependencies: '["A"]', // legacy form, parses to FS+1
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.A).toEqual({
      start: "2026-04-25",
      end: "2026-05-01",
      shifted: false,
      shiftedBy: 0,
      cycle: false,
    });
    expect(eff.B).toEqual({
      // 05-02 is a SATURDAY. Since §2.1 a driven start snaps to the next
      // working day, so "the day after A ends" is Monday 05-04.
      start: "2026-05-04",
      end: "2026-05-07", // duration (3 days) preserved across the snap
      shifted: true,
      shiftedBy: 14, // 2026-04-20 → 2026-05-04
      cycle: false,
    });
  });

  it("does not shift when stored start already satisfies the link", () => {
    // A ends 2026-04-25, B starts 2026-05-01 — no shift needed.
    const tasks = [
      { id: "A", start_date: "2026-04-20", end_date: "2026-04-25" },
      {
        id: "B",
        start_date: "2026-05-01",
        end_date: "2026-05-04",
        dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 1 }]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.B.shifted).toBe(false);
    expect(eff.B.start).toBe("2026-05-01");
  });
});

describe("computeEffectiveDates — orphaned dependency", () => {
  it("ignores a dependency pointing at a non-existent task (keeps its own dates)", () => {
    const tasks = [
      {
        id: "B",
        start_date: "2026-05-01",
        end_date: "2026-05-05",
        dependencies: JSON.stringify([{ id: "GHOST", type: "FS", lag_days: 1 }]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.B).toEqual({
      start: "2026-05-01",
      end: "2026-05-05",
      shifted: false,
      shiftedBy: 0,
      cycle: false,
    });
  });

  it("honours a real predecessor while ignoring an orphaned one in the same list", () => {
    const tasks = [
      { id: "A", start_date: "2026-05-10", end_date: "2026-05-14" },
      {
        id: "B",
        start_date: "2026-05-01",
        end_date: "2026-05-05",
        dependencies: JSON.stringify([
          { id: "GHOST", type: "FS", lag_days: 1 },
          { id: "A", type: "FS", lag_days: 1 },
        ]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.B.shifted).toBe(true);
    expect(eff.B.start).toBe("2026-05-15"); // day after A ends; GHOST ignored
  });
});

describe("computeEffectiveDates — link-type semantics", () => {
  const A = { id: "A", start_date: "2026-05-10", end_date: "2026-05-14" };

  function buildPair(linkType, lag, bStart = "2026-05-01", bEnd = "2026-05-03") {
    return [
      A,
      {
        id: "B",
        start_date: bStart,
        end_date: bEnd,
        dependencies: JSON.stringify([
          { id: "A", type: linkType, lag_days: lag },
        ]),
      },
    ];
  }

  it("FS — successor.start >= predecessor.end + lag", () => {
    const eff = computeEffectiveDates(buildPair("FS", 0));
    expect(eff.B.start).toBe("2026-05-14"); // A ends 5/14, lag 0 → start 5/14
    expect(eff.B.end).toBe("2026-05-16"); // 2-day duration preserved
  });

  it("FS lag=1 mirrors the old inline cascade", () => {
    const eff = computeEffectiveDates(buildPair("FS", 1));
    expect(eff.B.start).toBe("2026-05-15");
  });

  it("SS — successor.start >= predecessor.start + lag", () => {
    const eff = computeEffectiveDates(buildPair("SS", 0));
    // A starts Sunday 05-10 with lag 0; the successor snaps to Monday 05-11.
    expect(eff.B.start).toBe("2026-05-11");
    expect(eff.B.end).toBe("2026-05-13");
  });

  it("SS with positive lag", () => {
    const eff = computeEffectiveDates(buildPair("SS", 3));
    expect(eff.B.start).toBe("2026-05-13");
  });

  it("FF — successor.end >= predecessor.end + lag, duration preserved", () => {
    const eff = computeEffectiveDates(buildPair("FF", 0));
    expect(eff.B.end).toBe("2026-05-14"); // matches A end
    expect(eff.B.start).toBe("2026-05-12"); // pulled back by duration
  });

  it("SF — successor.end >= predecessor.start + lag", () => {
    const eff = computeEffectiveDates(buildPair("SF", 0));
    // SF drives the FINISH; 05-10 is a Sunday, so it lands Monday 05-11.
    expect(eff.B.end).toBe("2026-05-11");
    // The derived edge is deliberately NOT snapped: SF constrains the FINISH,
    // and snapping the start it implies would change the task's length to
    // satisfy a rule that was never about its start. 05-09 is a Saturday,
    // and that is the honest consequence of a finish-driven link.
    expect(eff.B.start).toBe("2026-05-09");
  });

  it("negative lag — fast-tracking on FS lets B start before A ends", () => {
    const eff = computeEffectiveDates(buildPair("FS", -3, "2026-05-01", "2026-05-03"));
    // A ends 5/14, lag -3 → minStart 5/11. B's stored start (5/1) is
    // earlier so it gets pulled forward to 5/11.
    expect(eff.B.start).toBe("2026-05-11");
  });
});

describe("computeEffectiveDates — multi-predecessor", () => {
  it("picks the latest constraint across multiple predecessors", () => {
    const tasks = [
      { id: "A", start_date: "2026-05-01", end_date: "2026-05-05" },
      { id: "B", start_date: "2026-05-08", end_date: "2026-05-10" },
      {
        id: "C",
        start_date: "2026-04-20",
        end_date: "2026-04-22",
        dependencies: JSON.stringify([
          { id: "A", type: "FS", lag_days: 1 }, // would push to 5/6
          { id: "B", type: "FS", lag_days: 1 }, // would push to 5/11 — wins
        ]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.C.start).toBe("2026-05-11");
  });

  it("transitively cascades A → B → C", () => {
    // A is delayed; B follows; C follows B.
    const tasks = [
      { id: "A", start_date: "2026-05-01", end_date: "2026-05-10" },
      {
        id: "B",
        start_date: "2026-05-01",
        end_date: "2026-05-03",
        dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 1 }]),
      },
      {
        id: "C",
        start_date: "2026-05-01",
        end_date: "2026-05-02",
        dependencies: JSON.stringify([{ id: "B", type: "FS", lag_days: 1 }]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.B.start).toBe("2026-05-11");
    expect(eff.B.end).toBe("2026-05-13");
    expect(eff.C.start).toBe("2026-05-14"); // B ends 5/13 → C starts 5/14
  });
});

describe("computeEffectiveDates — cycle handling", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("flags every task in the cycle and falls back to stored dates", () => {
    const tasks = [
      {
        id: "A",
        start_date: "2026-05-01",
        end_date: "2026-05-05",
        dependencies: JSON.stringify([{ id: "B", type: "FS", lag_days: 1 }]),
      },
      {
        id: "B",
        start_date: "2026-05-10",
        end_date: "2026-05-12",
        dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 1 }]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.A.cycle).toBe(true);
    expect(eff.B.cycle).toBe(true);
    // Stored dates retained (the cascade can't safely place a cycle).
    expect(eff.A.start).toBe("2026-05-01");
    expect(eff.B.start).toBe("2026-05-10");
    expect(console.warn).toHaveBeenCalled();
  });

  it("ignores self-references (data-entry bug) without flagging cycle", () => {
    const tasks = [
      {
        id: "A",
        start_date: "2026-05-01",
        end_date: "2026-05-05",
        dependencies: JSON.stringify([{ id: "A", type: "FS", lag_days: 1 }]),
      },
    ];
    const eff = computeEffectiveDates(tasks);
    expect(eff.A.cycle).toBe(false);
    expect(eff.A.shifted).toBe(false);
  });
});

describe("applyEffectiveDates — wrapper", () => {
  it("overlays effective dates while preserving stored values", () => {
    const tasks = [
      { id: "A", start_date: "2026-04-25", end_date: "2026-05-01" },
      {
        id: "B",
        start_date: "2026-04-20",
        end_date: "2026-04-23",
        dependencies: '["A"]',
      },
    ];
    const result = applyEffectiveDates(tasks);
    const b = result.find((t) => t.id === "B");
    expect(b.start_date).toBe("2026-05-04"); // Sat 05-02 → Mon (§2.1)
    expect(b._stored_start_date).toBe("2026-04-20");
    expect(b._shifted).toBe(true);
    expect(b._shifted_by).toBe(14);
  });

  it("returns shallow copies — original tasks untouched", () => {
    const tasks = [
      { id: "A", start_date: "2026-04-25", end_date: "2026-05-01" },
      {
        id: "B",
        start_date: "2026-04-20",
        end_date: "2026-04-23",
        dependencies: '["A"]',
      },
    ];
    applyEffectiveDates(tasks);
    expect(tasks[1].start_date).toBe("2026-04-20");
    expect(tasks[1]._stored_start_date).toBeUndefined();
  });

  it("is idempotent — a second overlay keeps the ORIGINAL stored dates", () => {
    // Regression: `_stored_*` used to be assigned unconditionally, so overlaying
    // an already-overlaid row recorded the EFFECTIVE date as the stored one and
    // the pre-cascade truth was lost. Consumers that overlay and then hand the
    // rows to another overlaying helper (or that re-render through a second
    // pass) would then show, and could persist, a cascaded date as if the user
    // had typed it. Same clobber class as scheduleTree's rollupSummary.
    const tasks = [
      { id: "A", start_date: "2026-04-25", end_date: "2026-05-01" },
      {
        id: "B",
        start_date: "2026-04-20",
        end_date: "2026-04-23",
        dependencies: '["A"]',
      },
    ];

    const once = applyEffectiveDates(tasks);
    const twice = applyEffectiveDates(once);
    const thrice = applyEffectiveDates(twice);

    for (const pass of [once, twice, thrice]) {
      const b = pass.find((t) => t.id === "B");
      expect(b._stored_start_date).toBe("2026-04-20");
      expect(b._stored_end_date).toBe("2026-04-23");
      // The effective placement is a fixed point: re-applying never walks it on.
      expect(b.start_date).toBe("2026-05-04"); // Sat 05-02 → Mon (§2.1)
      expect(b._shifted).toBe(true);
      expect(b._shifted_by).toBe(14);
    }
  });

  it("keeps a row's own stored dates when it was overlaid with no shift", () => {
    // An unshifted row is still overlaid (start/end resolve), so it also carries
    // `_stored_*`. Re-overlaying must not turn those into the effective values.
    const tasks = [{ id: "A", start_date: "2026-04-25", end_date: "2026-05-01" }];
    const b = applyEffectiveDates(applyEffectiveDates(tasks)).find((t) => t.id === "A");
    expect(b._stored_start_date).toBe("2026-04-25");
    expect(b._stored_end_date).toBe("2026-05-01");
    expect(b._shifted).toBe(false);
  });
});

describe("LINK_TYPES export", () => {
  it("contains the four canonical types", () => {
    expect(LINK_TYPES).toEqual(["FS", "SS", "FF", "SF"]);
  });
});
