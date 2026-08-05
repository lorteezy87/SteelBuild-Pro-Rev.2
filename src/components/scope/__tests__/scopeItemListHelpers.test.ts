import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS, TYPE_COLORS } from "../scopeItemListHelpers";

describe("scopeItemListHelpers", () => {
  it("category colors", () => {
    expect(CATEGORY_COLORS.Structural).toBe("var(--accent)");
    expect(CATEGORY_COLORS.Erection).toBe("var(--status-success)");
  });
});

describe("TYPE_COLORS", () => {
  it("maps scope item types", () => {
    expect(TYPE_COLORS.Scope).toBe("var(--status-success)");
    expect(TYPE_COLORS.Exclusion).toBe("var(--status-error)");
  });
});

