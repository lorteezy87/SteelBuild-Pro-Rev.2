import { describe, expect, it } from "vitest";
import { inputStyle, labelStyle } from "../changeRequestFormModalStyleHelpers";

describe("changeRequestFormModalStyleHelpers", () => {
  it("input and label", () => {
    expect(inputStyle.fontSize).toBe(12);
    expect(labelStyle.letterSpacing).toBe("0.10em");
  });
});
