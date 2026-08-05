import { describe, expect, it } from "vitest";
import {
  drawerSurface,
  drawerControlStyle,
  drawerPanelStrong,
} from "@/components/schedule/taskDetailTokens";
import {
  drawerSurface as primSurface,
  drawerControlStyle as primControl,
} from "@/components/schedule/taskDetailPrimitives";

describe("residual catalog atoms batch Y", () => {
  it("task detail tokens are the single source for drawer chrome", () => {
    expect(drawerSurface).toBe("var(--bg-surface-secondary)");
    expect(drawerPanelStrong).toBe("var(--bg-surface-high)");
    expect(drawerControlStyle.borderRadius).toBe(8);
    expect(drawerControlStyle.fontSize).toBe(12);
  });

  it("primitives re-export the same chrome tokens", () => {
    expect(primSurface).toBe(drawerSurface);
    expect(primControl).toBe(drawerControlStyle);
  });
});
