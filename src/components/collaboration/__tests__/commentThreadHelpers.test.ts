import { describe, expect, it } from "vitest";
import {
  formatRelative,
  nextCommentStatus,
  COMMENT_STATUS_COLOR,
  COMMENT_STATUS_LABEL,
  COMMENT_STATUS_ORDER,
} from "../commentThreadHelpers";

describe("formatRelative", () => {
  it("formats buckets", () => {
    const now = Date.parse("2026-08-05T12:00:00Z");
    expect(formatRelative("2026-08-05T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-08-05T11:00:00Z", now)).toBe("1h ago");
    expect(formatRelative(null)).toBe("");
  });
});

describe("comment status chrome", () => {
  it("cycles status and exposes colors/labels", () => {
    expect(nextCommentStatus("open")).toBe("addressed");
    expect(nextCommentStatus("clarification")).toBe("open");
    expect(COMMENT_STATUS_COLOR.addressed).toBe("#10b981");
    expect(COMMENT_STATUS_LABEL.rejected).toBe("NO");
    expect(COMMENT_STATUS_ORDER).toHaveLength(4);
  });
});
