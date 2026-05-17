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
      start: "2026-05-02", // day after A ends
      end: "2026-05-05", // duration (3 days) preserved
      shifted: true,
      shiftedBy: 12, // 2026-04-20 → 2026-05-02
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
    expect(eff.B.start).toBe("2026-05-10"); // A starts 5/10, lag 0
    expect(eff.B.end).toBe("2026-05-12");
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
    expect(eff.B.end).toBe("2026-05-10");
    expect(eff.B.start).toBe("2026-05-08");
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
    expect(b.start_date).toBe("2026-05-02");
    expect(b._stored_start_date).toBe("2026-04-20");
    expect(b._shifted).toBe(true);
    expect(b._shifted_by).toBe(12);
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
});

describe("LINK_TYPES export", () => {
  it("contains the four canonical types", () => {
    expect(LINK_TYPES).toEqual(["FS", "SS", "FF", "SF"]);
  });
});
