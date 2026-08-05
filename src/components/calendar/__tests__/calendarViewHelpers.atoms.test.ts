import { describe, expect, it } from "vitest";
import {
  MAX_VISIBLE_EVENTS,
  DAY_HEADERS_SUN,
  DAY_HEADERS_MON,
  DAY_VIEW_COLLAPSE_AT,
} from "../calendarViewHelpers";

describe("calendar view atoms", () => {
  it("month/day layout tokens", () => {
    expect(MAX_VISIBLE_EVENTS).toBe(3);
    expect(DAY_HEADERS_SUN).toHaveLength(7);
    expect(DAY_HEADERS_MON[0]).toBe("MON");
    expect(DAY_VIEW_COLLAPSE_AT).toBe(10);
  });
});
