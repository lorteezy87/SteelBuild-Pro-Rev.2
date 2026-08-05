import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  toISODate,
  mostRecentTuesday,
  formatLongDate,
  shiftDate,
  indexProjectsById,
} from "../productionNotesHelpers";

describe("productionNotesHelpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00")); // Wednesday
  });
  afterEach(() => vi.useRealTimers());

  it("computes ISO and most recent Tuesday", () => {
    expect(toISODate(new Date("2026-04-21T15:00:00"))).toBe("2026-04-21");
    expect(mostRecentTuesday()).toBe("2026-04-21");
  });

  it("formats and shifts dates", () => {
    expect(formatLongDate("2026-04-21")).toContain("TUESDAY");
    expect(shiftDate("2026-04-21", 7)).toBe("2026-04-28");
  });

  it("indexes projects", () => {
    expect(indexProjectsById([{ id: "a", name: "A" }, { id: "b" }]).a.name).toBe("A");
  });
});
