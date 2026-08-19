import { describe, expect, it } from "vitest";
import {
  REGISTER_VIRTUALIZE_THRESHOLD,
  shouldVirtualizeRegister,
} from "../registerVirtualize";

describe("shouldVirtualizeRegister", () => {
  it("keeps small registers in document flow", () => {
    expect(shouldVirtualizeRegister(0)).toBe(false);
    expect(shouldVirtualizeRegister(REGISTER_VIRTUALIZE_THRESHOLD)).toBe(false);
  });

  it("virtualizes once the list exceeds the house threshold", () => {
    expect(shouldVirtualizeRegister(REGISTER_VIRTUALIZE_THRESHOLD + 1)).toBe(true);
    expect(shouldVirtualizeRegister(500)).toBe(true);
  });
});
