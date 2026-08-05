import { describe, expect, it } from "vitest";
import {
  DESKTOP_CONNECT_PAGE_STYLE,
  DESKTOP_CONNECT_CARD_STYLE,
  DESKTOP_CONNECT_BRAND_STYLE,
  DESKTOP_CONNECT_TITLE_STYLE,
  desktopConnectErrorBox,
} from "@/components/desktopConnect/desktopConnectHelpers";
import { NATURAL_COMPARE_OPTIONS } from "@/lib/drawingSetOrdering";

describe("residual catalog atoms batch W", () => {
  it("desktop connect shell chrome", () => {
    expect(DESKTOP_CONNECT_PAGE_STYLE.minHeight).toBe("100dvh");
    expect(DESKTOP_CONNECT_CARD_STYLE.maxWidth).toBe(460);
    expect(DESKTOP_CONNECT_BRAND_STYLE.color).toBe("var(--accent)");
    expect(DESKTOP_CONNECT_TITLE_STYLE.fontSize).toBe(24);
    expect(desktopConnectErrorBox.color).toBe("var(--status-error)");
  });

  it("natural compare options for drawing sets", () => {
    expect(NATURAL_COMPARE_OPTIONS.numeric).toBe(true);
    expect(NATURAL_COMPARE_OPTIONS.sensitivity).toBe("base");
    expect("A2".localeCompare("A10", undefined, NATURAL_COMPARE_OPTIONS)).toBeLessThan(0);
  });
});
