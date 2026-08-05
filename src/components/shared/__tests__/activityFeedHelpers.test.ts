import { describe, expect, it } from "vitest";
import { groupByDate, timeAgo, A } from "../activityFeedHelpers";

describe("activity feed pure", () => {
  it("reads timestamp accessors", () => {
    expect(A.timestamp({ created_at: "2026-01-01" })).toBe("2026-01-01");
  });
  it("groups activities into buckets", () => {
    const g = groupByDate([{ timestamp: new Date().toISOString(), id: "1" } as any]);
    const total = g.Today.length + g.Yesterday.length + g["This Week"].length + g.Older.length;
    expect(total).toBe(1);
  });
  it("formats time ago", () => {
    expect(timeAgo(new Date().toISOString())).toBe("just now");
  });
});
