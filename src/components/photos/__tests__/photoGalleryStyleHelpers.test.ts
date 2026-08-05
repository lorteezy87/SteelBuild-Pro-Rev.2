import { describe, expect, it } from "vitest";
import { navButtonStyle, panelButtonStyle, editInputStyle, CATEGORY_COLORS, PHOTO_CATEGORIES } from "../photoGalleryStyleHelpers";

describe("photo gallery styles", () => {
  it("navButtonStyle positions by side", () => {
    expect(navButtonStyle("left").left).toBe(16);
    expect(navButtonStyle("right").right).toBe(16);
  });
  it("panelButtonStyle variants", () => {
    expect(panelButtonStyle({ primary: true }).background).toBe("var(--accent)");
    expect(panelButtonStyle({ destructive: true }).color).toBe("var(--status-error)");
    expect(panelButtonStyle({ disabled: true }).opacity).toBe(0.5);
  });
  it("editInputStyle is stable", () => {
    expect(editInputStyle.fontSize).toBe(12);
  });
});

describe("photo category chrome", () => {
  it("category colors", () => {
    expect(CATEGORY_COLORS.Safety).toBe("var(--status-error)");
    expect(PHOTO_CATEGORIES).toContain("Punchlist");
  });
});
