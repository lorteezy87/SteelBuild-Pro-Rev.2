import { describe, expect, it } from "vitest";
import { labelStyle } from "../scopeItemFormModalStyleHelpers";

describe("scopeItemFormModalStyleHelpers", () => {
  it("label style", () => {
    expect(labelStyle.fontSize).toBe(10);
    expect(labelStyle.textTransform).toBe("uppercase");
  });
});
