import { describe, expect, it } from "vitest";
import { PHASE_OPTIONS } from "../costControlCenterHelpers";

describe("costControlCenterHelpers", () => {
  it("phase options", () => {
    expect(PHASE_OPTIONS).toContain("Labor");
    expect(PHASE_OPTIONS[0]).toBe("All");
  });
});
