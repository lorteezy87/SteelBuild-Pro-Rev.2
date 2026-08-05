import { describe, expect, it } from "vitest";
import { resolveCalculatorTabKey } from "../calculatorsHubPageHelpers";

describe("calculatorsHubPageHelpers", () => {
  it("resolves tab keys", () => {
    expect(resolveCalculatorTabKey("steelweight")).toBe("steelweight");
    expect(resolveCalculatorTabKey("x")).toBe("calculator");
  });
});

import { CALCULATOR_HUB_TAB_DEFS } from "../calculatorsHubPageHelpers";

describe("CALCULATOR_HUB_TAB_DEFS", () => {
  it("matches calculator tab keys", () => {
    expect(CALCULATOR_HUB_TAB_DEFS.map((t) => t.key)).toContain("steelweight");
  });
});
