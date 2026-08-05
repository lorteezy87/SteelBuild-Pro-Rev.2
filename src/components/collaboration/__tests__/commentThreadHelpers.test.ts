import { describe, expect, it } from "vitest";
import { formatRelative } from "../commentThreadHelpers";

describe("formatRelative", () => {
  it("formats buckets", () => {
    const now = Date.parse("2026-08-05T12:00:00Z");
    expect(formatRelative("2026-08-05T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-08-05T11:00:00Z", now)).toBe("1h ago");
    expect(formatRelative(null)).toBe("");
  });
});
