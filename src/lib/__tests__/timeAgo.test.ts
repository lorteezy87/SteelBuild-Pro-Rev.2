import { describe, expect, it } from "vitest";
import { timeAgo } from "../timeAgo";

describe("timeAgo", () => {
  const now = Date.parse("2026-08-05T12:00:00.000Z");
  it("handles empty and buckets", () => {
    expect(timeAgo(null, now)).toBe("Never");
    expect(timeAgo("2026-08-05T11:59:30.000Z", now)).toBe("just now");
    expect(timeAgo("2026-08-05T11:30:00.000Z", now)).toBe("30m ago");
    expect(timeAgo("2026-08-05T09:00:00.000Z", now)).toBe("3h ago");
    expect(timeAgo("2026-08-03T12:00:00.000Z", now)).toBe("2d ago");
  });
});
