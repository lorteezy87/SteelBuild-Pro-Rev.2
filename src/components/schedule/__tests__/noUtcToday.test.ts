import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Guard for audit §2.5. The nine call sites that derived "today" from UTC are
 * fixed; this stops a tenth appearing.
 *
 * The distinction this guard has to respect — and the reason it is a targeted
 * scan rather than a blanket ban on `getUTC*` — is that the module has two
 * legitimate, load-bearing uses of UTC that must NOT be "fixed":
 *
 *   * `parseDateUTC` / `parseDateOnly` read a stored 'YYYY-MM-DD' as
 *     T00:00:00Z on purpose, so a date-only column does not shift by timezone.
 *   * `useGanttLayout` reads `getUTCFullYear()` off an already-UTC-parsed Date
 *     for its [1900, 2200] sanity clamp.
 *
 * Both are correct. Only deriving *now* from UTC is the bug, so that is all
 * this matches.
 */

const ROOTS = [
  join(__dirname, ".."),                      // src/components/schedule
  join(__dirname, "../../../pages/schedule"), // src/pages/schedule
];

/** Deriving today's date string from UTC: `new Date().toISOString()...`. */
const UTC_TODAY_STRING = /new\s+Date\(\)\s*\.\s*toISOString\s*\(\)/;

/** Deriving today's calendar date from UTC getters on a fresh Date. */
const UTC_TODAY_PARTS = /get(?:UTCFullYear|UTCMonth|UTCDate)\(\)\s*,\s*\w+\.getUTC(?:Month|Date)\(\)/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__") continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments so prose describing the old bug does not trip the guard. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no UTC-derived 'today' in the schedule module", () => {
  const files = ROOTS.flatMap(sourceFiles);

  it("scans a plausible number of files", () => {
    // A broken path glob would make every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(20);
  });

  it("nothing builds a date string from new Date().toISOString()", () => {
    const offenders = files.filter((f) => UTC_TODAY_STRING.test(stripComments(readFileSync(f, "utf8"))));
    // todayLocalISO() is the replacement — it reads local getters.
    expect(offenders.map((f) => f.replace(/.*\/src\//, "src/"))).toEqual([]);
  });

  it("nothing builds today's calendar date from UTC getters", () => {
    const offenders = files.filter((f) => UTC_TODAY_PARTS.test(stripComments(readFileSync(f, "utf8"))));
    // todayUtcMidnightFromLocal() is the replacement: local getters, UTC anchor.
    expect(offenders.map((f) => f.replace(/.*\/src\//, "src/"))).toEqual([]);
  });

  it("the guard actually bites", () => {
    // Meta-test: a guard that matches nothing would pass forever after a typo.
    expect(UTC_TODAY_STRING.test('const t = new Date().toISOString().split("T")[0];')).toBe(true);
    expect(UTC_TODAY_PARTS.test("new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))")).toBe(true);
  });

  it("does not flag the legitimate UTC parsing it must leave alone", () => {
    // parseDateUTC's clamp and useGanttLayout's sanity check both read
    // getUTCFullYear() on an already-parsed Date. Flagging those would push
    // someone to "fix" them and reintroduce the date-only shift.
    expect(UTC_TODAY_STRING.test("const y = d.getUTCFullYear();")).toBe(false);
    expect(UTC_TODAY_PARTS.test("const y = d.getUTCFullYear();")).toBe(false);
    expect(UTC_TODAY_PARTS.test("const startYear = start.getUTCFullYear();")).toBe(false);
    expect(UTC_TODAY_STRING.test("return dt.toISOString().slice(0, 10);")).toBe(false);
  });
});
