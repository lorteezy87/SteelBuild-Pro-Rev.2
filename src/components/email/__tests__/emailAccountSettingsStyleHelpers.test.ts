import { describe, expect, it } from "vitest";
import {
  hintTextStyle,
  labelStyle,
  inputStyle,
  primaryBtnStyle,
  secondaryBtnStyle,
  iconBtnStyle,
} from "../emailAccountSettingsStyleHelpers";

describe("emailAccountSettingsStyleHelpers", () => {
  it("form chrome", () => {
    expect(hintTextStyle.fontSize).toBe(10);
    expect(labelStyle.textTransform).toBe("uppercase");
    expect(inputStyle.borderRadius).toBe(8);
    expect(primaryBtnStyle.background).toBe("var(--accent)");
    expect(secondaryBtnStyle.background).toBe("var(--bg-surface)");
    expect(iconBtnStyle.width).toBe(30);
  });
});
