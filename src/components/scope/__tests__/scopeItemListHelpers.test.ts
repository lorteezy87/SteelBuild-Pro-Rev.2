import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS } from "../scopeItemListHelpers";

describe("scopeItemListHelpers", () => {
  it("category colors", () => {
    expect(CATEGORY_COLORS.Structural).toBe("var(--accent)");
    expect(CATEGORY_COLORS.Erection).toBe("var(--status-success)");
  });
});
