import { describe, expect, it } from "vitest";
import { inputStyle, labelStyle } from "../riskFormModalStyleHelpers";

describe("riskFormModalStyleHelpers", () => {
  it("input and label", () => {
    expect(inputStyle.fontSize).toBe(12);
    expect(labelStyle.textTransform).toBe("uppercase");
  });
});
