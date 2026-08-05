import { describe, expect, it } from "vitest";
import { formatStamp } from "../signoffStampHelpers";

describe("formatStamp", () => {
  it("formats iso or dash", () => {
    expect(formatStamp(null)).toBe("—");
    expect(formatStamp("2026-01-01T00:00:00Z")).toMatch(/2026|1/);
  });
});
