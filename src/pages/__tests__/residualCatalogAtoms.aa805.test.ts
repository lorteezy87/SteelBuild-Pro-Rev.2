import { describe, expect, it } from "vitest";
import { TERMINAL_APPROVED } from "@/services/drawingHealthScore";
import { COMMENT_MENTION_STYLE } from "@/components/collaboration/commentThreadHelpers";
import CommentBody from "@/components/collaboration/CommentBody";

describe("residual catalog atoms batch AA", () => {
  it("terminal approved outcomes and mention chrome", () => {
    expect(TERMINAL_APPROVED.has("Approved")).toBe(true);
    expect(TERMINAL_APPROVED.has("Released for Fabrication")).toBe(true);
    expect(TERMINAL_APPROVED.has("Draft")).toBe(false);
    expect(COMMENT_MENTION_STYLE.color).toBe("var(--accent)");
    expect(COMMENT_MENTION_STYLE.fontWeight).toBe(600);
  });

  it("CommentBody presentational extract exists", () => {
    expect(typeof CommentBody).toBe("function");
  });
});
