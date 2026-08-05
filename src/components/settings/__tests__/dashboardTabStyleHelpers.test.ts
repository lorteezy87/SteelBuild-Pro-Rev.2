import { describe, expect, it } from "vitest";
import { labelStyle, selectStyle } from "../dashboardTabStyleHelpers";

describe("dashboardTabStyleHelpers", () => {
  it("label and select", () => {
    expect(labelStyle.fontSize).toBe(8);
    expect(selectStyle.borderRadius).toBe(8);
  });
});
