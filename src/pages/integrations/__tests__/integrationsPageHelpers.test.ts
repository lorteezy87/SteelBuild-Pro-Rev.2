import { describe, expect, it } from "vitest";
import { customerToneStyle, statusStyle, QUICK_LINKS } from "../integrationsPageHelpers";

describe("integrationsPageHelpers", () => {
  it("maps known statuses", () => {
    expect(statusStyle("Planned").color).toBe("var(--warning)");
    expect(statusStyle("missing").color).toBe("var(--warning)"); // fallback Planned
  });

  it("maps customer tones via catalog meta", () => {
    const tone = customerToneStyle("connected");
    expect(tone).toHaveProperty("color");
    expect(tone).toHaveProperty("bg");
  });

  it("exposes quick links", () => {
    expect(QUICK_LINKS.map((l) => l.page)).toContain("Documents");
  });
});
