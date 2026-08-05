import { describe, expect, it } from "vitest";
import { modalSurfaceStyle, controlSurfaceStyle } from "../submittalBulkEditModalStyleHelpers";

describe("submittalBulkEditModalStyleHelpers", () => {
  it("surface styles", () => {
    expect(modalSurfaceStyle.borderRadius).toBe(16);
    expect(controlSurfaceStyle.colorScheme).toBe("dark");
  });
});
