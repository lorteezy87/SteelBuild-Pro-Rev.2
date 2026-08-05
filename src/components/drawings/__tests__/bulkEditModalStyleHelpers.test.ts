import { describe, expect, it } from "vitest";
import { labelStyle } from "../bulkEditModalStyleHelpers";

describe("bulkEditModalStyleHelpers", () => {
  it("label style", () => {
    expect(labelStyle.fontSize).toBe(9);
    expect(labelStyle.fontFamily).toBe("var(--font-mono)");
  });
});
