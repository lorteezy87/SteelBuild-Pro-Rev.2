import { describe, expect, it } from "vitest";
import { monoStyle, displayStyle, AI_ACCENT } from "../shippingTicketImportModalHelpers";

describe("shippingTicketImportModalHelpers", () => {
  it("typography atoms", () => {
    expect(monoStyle.fontFamily).toContain("mono");
    expect(displayStyle.fontFamily).toContain("Space Grotesk");
    expect(AI_ACCENT).toContain("ai-accent");
  });
});
