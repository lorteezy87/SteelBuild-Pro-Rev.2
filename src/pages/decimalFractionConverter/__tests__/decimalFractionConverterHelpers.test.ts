import { describe, expect, it } from "vitest";
import {
  deltaDisplay,
  numOrZero,
  trimNumber,
  toggleStyle,
} from "../decimalFractionConverterHelpers";

describe("decimalFractionConverterHelpers", () => {
  it("formats delta and numbers", () => {
    expect(deltaDisplay(0.01234, "feet")).toContain("ft");
    expect(deltaDisplay(-0.5, "inches")).toContain('"');
    expect(numOrZero("")).toBe(0);
    expect(numOrZero("12.5")).toBe(12.5);
    expect(trimNumber(1.25)).toBe("1.25");
    expect(trimNumber(1)).toBe("1");
  });

  it("builds toggle styles", () => {
    expect(toggleStyle(true).background).toBe("var(--accent)");
    expect(toggleStyle(false).background).toBe("var(--bg-surface-low)");
  });
});
