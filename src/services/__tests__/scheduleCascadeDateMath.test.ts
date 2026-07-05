/**
 * scheduleCascadeDateMath.test.ts
 *
 * Regression guard for the Schedule bulk "set / add / subtract duration" flow.
 * bulkDurationMut (src/pages/Schedule.tsx) derives a task's new end_date by
 * adding the new duration (in days) to its start_date. It used to do that with
 * local-time math:
 *
 *     const d = new Date(task.start_date + "T00:00:00"); // parsed as LOCAL time
 *     d.setDate(d.getDate() + newDur);
 *     fields.end_date = d.toISOString().split("T")[0];   // serialized as UTC
 *
 * That local-parse / UTC-serialize round-trip shifts the calendar day by one
 * whenever local midnight lands on a different UTC day — i.e. under any non-zero
 * UTC offset. The fix routes the arithmetic through scheduleCascade.addDaysIso,
 * which parses as UTC midnight and adds whole days in UTC — timezone-independent
 * by construction.
 *
 * Reproducing the bug deterministically:
 *   The obvious way to exercise a timezone bug is to set process.env.TZ. That
 *   does NOT work under this repo's vitest `threads` pool — assigning TZ inside a
 *   worker_thread never triggers the C-level tzset(), so Date parsing keeps the
 *   host zone (verified empirically). Instead, `naiveLocalAddDays` below replays
 *   the exact old computation for an EXPLICIT UTC offset, so the divergence is
 *   deterministic on every machine/pool/OS and needs no clock or TZ manipulation.
 *
 * Direction note: the off-by-one bites UTC-POSITIVE zones (e.g. Asia/Tokyo,
 * UTC+9), where end_date came out a day EARLY. UTC-negative zones such as
 * America/Phoenix (Arizona) happen to round-trip correctly, so the original
 * report's "Arizona" framing was inverted — the fix makes every zone correct.
 */
import { describe, expect, it } from "vitest";
import { addDaysIso } from "../scheduleCascade";

/**
 * Deterministic replay of the OLD, buggy inline math from bulkDurationMut for a
 * given host UTC offset (in the sign convention of Date.getTimezoneOffset():
 * minutes to ADD to local time to reach UTC — +420 for UTC-7/Phoenix, -540 for
 * UTC+9/Tokyo). Parse "YYYY-MM-DDT00:00:00" as LOCAL midnight, add `dur` days to
 * the LOCAL calendar date, then serialize the resulting instant back through UTC.
 */
function naiveLocalAddDays(start: string, dur: number, offsetMinutes: number): string {
  const [y, m, d] = start.split("-").map(Number);
  // new Date(start+"T00:00:00") -> instant = local-wall-midnight interpreted in
  // the host zone; UTC = localWall + offsetMinutes. .setDate(getDate()+dur) keeps
  // local time-of-day (00:00) and advances the LOCAL date by `dur`.
  const instantMs = Date.UTC(y, m - 1, d + dur, 0, 0, 0) + offsetMinutes * 60_000;
  return new Date(instantMs).toISOString().slice(0, 10);
}

const UTC = 0;
const PHOENIX = 420; // UTC-7, no DST (Arizona) — negative-UTC zone
const TOKYO = -540; // UTC+9, no DST — positive-UTC zone

describe("addDaysIso — timezone-safe end_date for Schedule bulk duration", () => {
  it("adds whole days as pure UTC calendar math, independent of host timezone", () => {
    expect(addDaysIso("2026-07-04", 5)).toBe("2026-07-09");
    expect(addDaysIso("2026-07-04", 0)).toBe("2026-07-04");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01"); // year boundary
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not a leap year
  });

  it("returns null for an unparseable start date (matches the bulkDurationMut guard)", () => {
    expect(addDaysIso("", 5)).toBeNull();
    expect(addDaysIso(null, 5)).toBeNull();
    expect(addDaysIso("not-a-date", 5)).toBeNull();
  });

  it("gives the correct end_date where the old local-parse math was off by one (UTC-positive)", () => {
    // The bug: under a positive-UTC offset the naive math yields the day BEFORE.
    expect(naiveLocalAddDays("2026-07-04", 5, TOKYO)).toBe("2026-07-08"); // WRONG (old)
    // The fix: correct, and it does not depend on the offset.
    expect(addDaysIso("2026-07-04", 5)).toBe("2026-07-09"); // RIGHT (new)
    expect(addDaysIso("2026-07-04", 5)).not.toBe(naiveLocalAddDays("2026-07-04", 5, TOKYO));
  });

  it("agrees with the old math in a negative-UTC zone (Arizona) — documenting the inverted direction", () => {
    // Arizona/Phoenix round-trips correctly under the OLD math, so Arizona users
    // were NOT hit by this off-by-one. The fix keeps Arizona correct too.
    expect(naiveLocalAddDays("2026-07-04", 5, PHOENIX)).toBe("2026-07-09");
    expect(addDaysIso("2026-07-04", 5)).toBe("2026-07-09");
  });

  it("matches the naive math only at UTC (offset 0), where local and UTC coincide", () => {
    expect(naiveLocalAddDays("2026-07-04", 5, UTC)).toBe("2026-07-09");
    expect(addDaysIso("2026-07-04", 5)).toBe("2026-07-09");
  });
});
