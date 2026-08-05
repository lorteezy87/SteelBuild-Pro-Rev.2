import { describe, expect, it } from "vitest";
import { RFI_PRIORITIES, PCO_REASONS } from "../escalateModalHelpers";

describe("escalateModal catalogs", () => {
  it("rfi priorities and pco reasons", () => {
    expect(RFI_PRIORITIES[0]).toBe("Critical");
    expect(PCO_REASONS).toContain("Design Change");
    expect(PCO_REASONS).toHaveLength(6);
  });
});
