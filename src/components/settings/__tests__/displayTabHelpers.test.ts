import { describe, expect, it } from "vitest";
import { buildPrefs } from "../displayTabHelpers";

describe("buildPrefs", () => {
  it("merges defaults", () => {
    const p = buildPrefs({}, { theme: "light", accent: "gold", fontScale: "md", contrast: "normal", motion: "auto" });
    expect(p.theme).toBe("light");
    expect(p.show_tooltips).toBe(true);
    expect(p.date_format).toBe("MM/DD/YYYY");
  });
});
