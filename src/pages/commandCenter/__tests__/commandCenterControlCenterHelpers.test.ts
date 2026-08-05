import { describe, expect, it } from "vitest";
import { TYPE_CHIPS } from "../commandCenterControlCenterHelpers";

describe("TYPE_CHIPS", () => {
  it("includes RFI", () => {
    expect(TYPE_CHIPS).toContain("RFI");
  });
});
