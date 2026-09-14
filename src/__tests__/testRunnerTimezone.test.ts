import { describe, expect, it } from "vitest";

/**
 * Guards the UTC pin in vite.config.js.
 *
 * Many fixtures assume the worker really runs in UTC — e.g. they build "today"
 * as `new Date().toISOString().slice(0, 10)` and expect a page that reads the
 * local day to agree. The pin used to live only in `test.env`, which Vitest
 * writes into each worker's `process.env`. Under the `threads` pool that is a
 * per-thread copy Node never re-reads the zone from, so workers kept the host
 * zone while `process.env.TZ` still said "UTC".
 *
 * On a UTC host this passes vacuously. CI runs the Vitest step with a non-UTC
 * TZ so a broken pin fails here rather than only on a dev box in the evening.
 */
describe("test runner time zone", () => {
  it("applies the pin to Date, not just to process.env", () => {
    expect(process.env.TZ).toBe("UTC");
    // January and July, so a DST zone can't pass by sitting on UTC half the year.
    expect(new Date(2026, 0, 15).getTimezoneOffset()).toBe(0);
    expect(new Date(2026, 6, 15).getTimezoneOffset()).toBe(0);
  });

  it("applies the pin to Intl", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toMatch(/^(Etc\/)?UTC$/);
  });
});
