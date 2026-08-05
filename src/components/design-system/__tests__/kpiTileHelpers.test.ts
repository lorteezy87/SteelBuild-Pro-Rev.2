import { describe, expect, it } from "vitest";
import { formatRelative } from "../kpiTileHelpers";

describe("kpi formatRelative", () => {
  it("formats relative windows", () => {
    const now = Date.parse("2026-08-05T12:00:00Z");
    expect(formatRelative("2026-08-05T11:59:40Z", now)).toBe("just now");
    expect(formatRelative("2026-08-05T10:00:00Z", now)).toBe("2h ago");
    expect(formatRelative(null)).toBeNull();
  });
});
