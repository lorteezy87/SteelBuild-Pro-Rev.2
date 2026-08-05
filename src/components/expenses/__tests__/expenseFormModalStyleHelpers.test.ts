import { describe, expect, it } from "vitest";
import { iStyle, labelStyle, sectionLabel, triggerStyle } from "../expenseFormModalStyleHelpers";

describe("expenseFormModalStyleHelpers", () => {
  it("form chrome", () => {
    expect(iStyle.fontSize).toBe(12);
    expect(labelStyle.fontSize).toBe(8);
    expect(sectionLabel.color).toBe("var(--accent)");
    expect(triggerStyle.height).toBe(34);
  });
});
