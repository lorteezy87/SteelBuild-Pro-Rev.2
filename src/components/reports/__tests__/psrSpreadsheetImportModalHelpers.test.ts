import { describe, expect, it } from "vitest";
import {
  cardStyle,
  mono,
  AI,
  selectStyle,
  btnPrimary,
  btnGhost,
  displayStyle,
} from "../psrSpreadsheetImportModalHelpers";

describe("psrSpreadsheetImportModalHelpers", () => {
  it("card style border uses color", () => {
    expect(cardStyle("red").borderLeft).toContain("red");
  });
  it("chrome tokens", () => {
    expect(mono.fontFamily).toBe("var(--font-mono)");
    expect(AI).toContain("ai-accent");
    expect(selectStyle.fontSize).toBe(12);
    expect(btnPrimary.background).toBe(AI);
    expect(btnGhost.background).toBe("transparent");
  });
});

describe("displayStyle", () => {
  it("uses Space Grotesk", () => {
    expect(displayStyle.fontFamily).toContain("Space Grotesk");
  });
});

