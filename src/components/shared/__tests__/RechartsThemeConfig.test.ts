// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { getChartTheme } from "../RechartsThemeConfig.jsx";

describe("getChartTheme", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to token references when optional chart variables are missing", () => {
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (name: string) => (name === "--accent" ? "  #123456  " : ""),
    } as CSSStyleDeclaration);

    const theme = getChartTheme();

    expect(theme.colors.primary).toBe("#123456");
    expect(theme.colors.chart1).toBe("var(--accent)");
    expect(theme.colors.chart2).toBe("var(--status-info)");
    expect(theme.palette).toEqual([
      "var(--accent)",
      "var(--status-info)",
      "var(--status-success)",
      "var(--status-warning)",
      "var(--status-review)",
      "#123456",
    ]);
  });
});
