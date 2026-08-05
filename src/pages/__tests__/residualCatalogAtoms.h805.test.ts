import { describe, expect, it } from "vitest";
import { CONTRACT_MGMT_TABS } from "../contractManagement/contractManagementHelpers";
import { PAGE_FOR_TYPE } from "@/components/commandcenter/itemDetailDrawerHelpers";
import {
  THEME_DEFAULTS,
  THEME_ALLOWED,
  FONT_SCALE_VALUE,
  THEME_PREF_KEYS,
} from "@/components/shared/themeContextHelpers";

describe("residual catalog atoms batch H", () => {
  it("contract management tabs", () => {
    expect(CONTRACT_MGMT_TABS).toEqual([
      "CHANGE ORDERS",
      "BILLING & SOV",
      "CONTRACT SUMMARY",
    ]);
  });

  it("command center page map", () => {
    expect(PAGE_FOR_TYPE.RFI).toBe("RFIs");
    expect(PAGE_FOR_TYPE.TASK).toBe("Schedule");
  });

  it("theme preference catalogs", () => {
    expect(THEME_DEFAULTS.theme).toBe("dark");
    expect(THEME_ALLOWED.accent.has("gold")).toBe(true);
    expect(FONT_SCALE_VALUE.md).toBe(1.0);
    expect(THEME_PREF_KEYS.accent).toBe("sbp-accent");
  });
});
