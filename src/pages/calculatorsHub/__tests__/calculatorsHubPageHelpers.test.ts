import { describe, expect, it } from "vitest";
import { resolveCalculatorTabKey } from "../calculatorsHubPageHelpers";

describe("calculatorsHubPageHelpers", () => {
  it("resolves tab keys", () => {
    expect(resolveCalculatorTabKey("steelweight")).toBe("steelweight");
    expect(resolveCalculatorTabKey("x")).toBe("calculator");
  });
});
