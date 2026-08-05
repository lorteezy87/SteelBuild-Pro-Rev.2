import { describe, expect, it } from "vitest";
import { STATUS_COLORS } from "../vendorListHelpers";

describe("vendorListHelpers", () => {
  it("status colors", () => {
    expect(STATUS_COLORS.Active).toBe("var(--status-success)");
    expect(STATUS_COLORS.Suspended).toBe("var(--status-error)");
  });
});
