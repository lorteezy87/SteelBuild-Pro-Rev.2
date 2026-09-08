import { describe, it, expect } from "vitest";
import { todayLocalISO, todayUtcMidnightFromLocal } from "../dateMath";

/**
 * Cover for audit §2.5 — "today" was derived from UTC everywhere in the
 * schedule module, and Arizona is UTC-7.
 *
 * From 5 PM local onward `getUTCDate()` is already tomorrow, so the Gantt's
 * today line jumped a day early, overdue flipped with it, the 6-week look-ahead
 * window slid forward, and every task entered after 5 PM defaulted to tomorrow.
 *
 * ## Why the clock is injected rather than the timezone switched
 *
 * The suite runs under TZ=UTC (vite.config.js), where local and UTC agree and
 * this bug is unreachable. Switching `process.env.TZ` inside the file does not
 * help either — Node caches the zone on first Date use, which vitest has
 * already triggered before any hook runs. (Tried; the tests passed vacuously.)
 *
 * So these pass a stub whose LOCAL getters and UTC getters deliberately
 * disagree, exactly as a real Date does at 6 PM in Phoenix. That tests the
 * property that actually matters — *which getters the function reads* — and it
 * holds under any TZ the CI runner happens to use.
 */

/**
 * A Date stand-in for 2026-09-08 18:30 Phoenix === 2026-09-09 01:30 UTC.
 * Local getters say the 8th; UTC getters say the 9th. Reading the wrong pair is
 * the entire bug.
 */
function phoenixEvening() {
  return {
    // local — the user's actual today
    getFullYear: () => 2026,
    getMonth: () => 8, // September (0-based)
    getDate: () => 8,
    getHours: () => 18,
    // UTC — already tomorrow
    getUTCFullYear: () => 2026,
    getUTCMonth: () => 8,
    getUTCDate: () => 9,
    getUTCHours: () => 1,
  };
}

/** Same clock, but a genuine Date under TZ=UTC, to prove the default path. */
const UTC_NOON = new Date("2026-09-08T12:00:00Z");

describe("the stub reproduces the real disagreement", () => {
  it("local says the 8th while UTC says the 9th", () => {
    // If this stops holding, every assertion below proves nothing.
    const now = phoenixEvening();
    expect(now.getDate()).toBe(8);
    expect(now.getUTCDate()).toBe(9);
  });
});

describe("todayLocalISO", () => {
  it("returns the local date at 6:30 PM Phoenix, not tomorrow", () => {
    expect(todayLocalISO(phoenixEvening())).toBe("2026-09-08");
  });

  it("zero-pads month and day", () => {
    const jan3 = { getFullYear: () => 2026, getMonth: () => 0, getDate: () => 3 };
    expect(todayLocalISO(jan3)).toBe("2026-01-03");
  });

  it("defaults to the real clock when nothing is passed", () => {
    expect(todayLocalISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("todayUtcMidnightFromLocal", () => {
  it("anchors the LOCAL day at UTC midnight", () => {
    // Both halves matter. The DATE must be the user's today, and the ANCHOR
    // must be UTC midnight so it compares with parseDateUTC's T00:00:00Z.
    // Reading UTC getters here yields 2026-09-09 — the day the Gantt's today
    // line used to jump to at 5 PM.
    expect(todayUtcMidnightFromLocal(phoenixEvening()).toISOString())
      .toBe("2026-09-08T00:00:00.000Z");
  });

  it("keeps the UTC-midnight anchor, not a local-midnight one", () => {
    // A local-midnight anchor would be 07:00Z in Phoenix and would silently
    // break every comparison against parseDateUTC-parsed task dates.
    const iso = todayUtcMidnightFromLocal(phoenixEvening()).toISOString();
    expect(iso.endsWith("T00:00:00.000Z")).toBe(true);
  });

  it("still advances at real local midnight", () => {
    // Guards against over-correcting into "the date never moves".
    const justAfterMidnight = {
      getFullYear: () => 2026, getMonth: () => 8, getDate: () => 9,
      getUTCFullYear: () => 2026, getUTCMonth: () => 8, getUTCDate: () => 9,
    };
    expect(todayUtcMidnightFromLocal(justAfterMidnight).toISOString())
      .toBe("2026-09-09T00:00:00.000Z");
  });

  it("agrees with todayLocalISO on the same instant", () => {
    // Two helpers, one answer — a today line that disagreed with the date a new
    // task defaults to would be its own bug.
    const now = phoenixEvening();
    expect(todayUtcMidnightFromLocal(now).toISOString().slice(0, 10))
      .toBe(todayLocalISO(now));
  });

  it("round-trips a real Date under the runner's own TZ", () => {
    expect(todayUtcMidnightFromLocal(UTC_NOON).toISOString())
      .toBe("2026-09-08T00:00:00.000Z");
  });
});
