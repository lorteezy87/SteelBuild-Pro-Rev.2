import { describe, expect, it } from "vitest";
import { resolvePortfolioTabKey } from "../portfolioHubPageHelpers";

describe("portfolioHubPageHelpers", () => {
  it("resolves tab keys", () => {
    expect(resolvePortfolioTabKey("executive")).toBe("executive");
    expect(resolvePortfolioTabKey("nope")).toBe("overview");
    expect(resolvePortfolioTabKey(null)).toBe("overview");
  });
});
