import { describe, expect, it } from "vitest";
import {
  labelStyle,
  inputStyle,
  primaryBtnStyle,
  secondaryBtnStyle,
  iconBtnStyle,
} from "../documentStorageSettingsStyleHelpers";

describe("documentStorageSettingsStyleHelpers", () => {
  it("form chrome", () => {
    expect(labelStyle.fontSize).toBe(10);
    expect(inputStyle.fontSize).toBe(12);
    expect(primaryBtnStyle.color).toBe("var(--on-accent)");
    expect(secondaryBtnStyle.fontWeight).toBe(500);
    expect(iconBtnStyle.height).toBe(30);
  });
});
