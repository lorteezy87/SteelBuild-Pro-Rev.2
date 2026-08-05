import { describe, expect, it } from "vitest";
import { categoryAccent, reportsForCategory } from "../reportsPageHelpers";

describe("reportsPageHelpers", () => {
  it("accent and category filter", () => {
    expect(categoryAccent("Risk")).toBe("var(--status-error)");
    expect(categoryAccent("Other")).toBe("var(--accent)");
    expect(
      reportsForCategory(
        [{ category: "Cost", slug: "a" }, { category: "Risk", slug: "b" }],
        "Cost",
      ),
    ).toHaveLength(1);
  });
});
