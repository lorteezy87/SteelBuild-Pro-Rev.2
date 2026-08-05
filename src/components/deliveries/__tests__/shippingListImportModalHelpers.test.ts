import { describe, expect, it } from "vitest";
import { monoStyle, displayStyle, ACCENT } from "../shippingListImportModalHelpers";

describe("shippingListImportModalHelpers", () => {
  it("typography and accent", () => {
    expect(monoStyle.fontFamily).toContain("mono");
    expect(displayStyle.fontFamily).toContain("Space Grotesk");
    expect(ACCENT).toContain("accent");
  });
});
