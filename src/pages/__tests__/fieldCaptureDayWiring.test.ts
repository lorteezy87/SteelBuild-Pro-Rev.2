import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The foreman's capture day is read ONCE, where the foreman taps.
 *
 * A progress tap formerly took two routes: the online write
 * (`persistScheduleProgress`) and, when there is no signal, a queued op
 * (`makeProgressOp`). Both need the LOCAL calendar day the tap happened on,
 * because that is the day `deriveActualsPatch` stamps onto
 * actual_start_date / actual_finish_date.
 *
 * Both used to call `localToday()` for themselves — and `onError` runs only
 * *after* the request has already failed. Tap at 11:59pm on a bad connection,
 * let the request reject at 12:01am, and the queued op records the next
 * calendar day. The taps this hits are end-of-shift ones, which is exactly when
 * a foreman closes a task out.
 *
 * So the day is captured in `setProgress` and carried on the mutation
 * variables. This is a source-wiring guard in the style of
 * src/pages/schedule/__tests__/actualsWiring.test.ts: a second clock read is
 * invisible to a rendered assertion without controlling time across the whole
 * mutation lifecycle.
 */

const SRC = readFileSync(new URL("../FieldToday.jsx", import.meta.url), "utf8");

/** The progress mutation plus setProgress — not the whole page. */
const PROGRESS_REGION = (() => {
  const start = SRC.indexOf("const progressMut = useMutation");
  expect(start, "progressMut not found — this guard would pass vacuously").toBeGreaterThan(-1);
  const end = SRC.indexOf("const punchMut = useMutation", start);
  expect(end, "punchMut not found — the region would run to EOF").toBeGreaterThan(start);
  return SRC.slice(start, end);
})();

describe("field progress captures the local day at the tap", () => {
  it("setProgress is the one place that reads the clock", () => {
    expect(PROGRESS_REGION).toMatch(/progressMut\.mutate\(\{[^}]*capturedDay:\s*localToday\(\)/);
  });

  it("reads localToday exactly once in the whole progress path", () => {
    // The heart of it. Two reads is the bug; one read is the fix.
    const reads = PROGRESS_REGION.match(/localToday\(\)/g) ?? [];
    expect(reads).toHaveLength(1);
  });

  it("the durable path takes the captured day from mutation variables", () => {
    expect(PROGRESS_REGION).toMatch(/mutationFn:\s*async\s*\(\{[^}]*capturedDay[^}]*\}\)/);
    expect(PROGRESS_REGION).toMatch(/makeProgressOp\(task\.id, pct, Date\.now\(\), capturedDay\)/);
  });

  it("online and offline taps share the same queue, with no direct write racing replay", () => {
    expect(PROGRESS_REGION).not.toContain("persistScheduleProgress(");
    const body = PROGRESS_REGION.slice(0, PROGRESS_REGION.indexOf("const setProgress"));
    expect(body).not.toMatch(/localToday\(\)/);
    expect(body.indexOf("enqueue(makeProgressOp")).toBeLessThan(body.indexOf("await flush()"));
  });
});
