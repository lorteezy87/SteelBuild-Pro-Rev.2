// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { bandForWidth, useResponsiveBreakpoint } from "../useResponsiveBreakpoint";

describe("bandForWidth", () => {
  it("classifies phone / tablet / desktop bands", () => {
    expect(bandForWidth(375)).toBe("phone");
    expect(bandForWidth(767)).toBe("phone");
    expect(bandForWidth(768)).toBe("tablet");
    expect(bandForWidth(1023)).toBe("tablet");
    expect(bandForWidth(1024)).toBe("desktop");
  });
});

describe("useResponsiveBreakpoint", () => {
  beforeEach(() => {
    vi.stubGlobal("innerWidth", 1200);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes desktop flags at 1200px", () => {
    const { result } = renderHook(() => useResponsiveBreakpoint());
    expect(result.current).toMatchObject({
      band: "desktop",
      isPhone: false,
      isTablet: false,
      isDesktop: true,
      isMobile: false,
    });
  });

  it("updates on resize into tablet then phone", () => {
    const { result } = renderHook(() => useResponsiveBreakpoint());
    act(() => {
      vi.stubGlobal("innerWidth", 834);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.band).toBe("tablet");
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);

    act(() => {
      vi.stubGlobal("innerWidth", 390);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.band).toBe("phone");
    expect(result.current.isMobile).toBe(true);
  });
});
