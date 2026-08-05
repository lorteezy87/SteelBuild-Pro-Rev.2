import { describe, expect, it } from "vitest";
import {
  labelStyle,
  inputStyle,
  primaryBtnStyle,
  secondaryBtnStyle,
  iconBtnStyle,
  PROVIDERS,
  SYNC_FREQUENCIES,
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

describe("PROVIDERS / SYNC_FREQUENCIES", () => {
  it("lists enabled cloud providers and frequencies", () => {
    expect(PROVIDERS.some((p) => p.value === "sharepoint" && p.enabled)).toBe(true);
    expect(SYNC_FREQUENCIES.map((f) => f.value)).toContain("daily");
  });
});

