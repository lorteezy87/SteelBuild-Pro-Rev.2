import { describe, expect, it } from "vitest";
import { formatUsd } from "../formatUsd";

describe("formatUsd", () => {
  it("formats numbers", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(null)).toBe("$0");
    expect(formatUsd(1234.5)).toMatch(/^\$1,234\.5/);
  });
});
