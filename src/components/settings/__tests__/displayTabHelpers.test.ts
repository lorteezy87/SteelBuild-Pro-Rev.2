import { describe, expect, it } from "vitest";
import {
  buildPrefs,
  labelStyle,
  selectStyle,
  optionCard,
} from "../displayTabHelpers";

describe("buildPrefs", () => {
  it("merges defaults", () => {
    const p = buildPrefs({}, { theme: "light", accent: "gold", fontScale: "md", contrast: "normal", motion: "auto" });
    expect(p.theme).toBe("light");
    expect(p.show_tooltips).toBe(true);
    expect(p.date_format).toBe("MM/DD/YYYY");
  });
});

describe("display tab styles", () => {
  it("label select optionCard", () => {
    expect(labelStyle.fontSize).toBe(8);
    expect(selectStyle.fontSize).toBe(12);
    expect(optionCard(true).background).toBe("var(--accent-muted)");
    expect(optionCard(false).cursor).toBe("pointer");
  });
});
