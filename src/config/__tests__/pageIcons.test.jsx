import { describe, it, expect } from "vitest";
import { PAGE_ICON, FallbackIcon, getPageIcon } from "@/config/pageIcons";

describe("pageIcons", () => {
  it("maps a known page to a component", () => {
    expect(typeof PAGE_ICON.Dashboard).toBe("object"); // forwardRef component
    expect(getPageIcon("Dashboard")).toBe(PAGE_ICON.Dashboard);
  });

  it("falls back for an unknown page", () => {
    expect(getPageIcon("NoSuchPageXYZ")).toBe(FallbackIcon);
  });

  it("exposes a fallback component", () => {
    expect(FallbackIcon).toBeTruthy();
  });
});
