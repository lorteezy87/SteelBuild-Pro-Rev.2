import { describe, expect, it } from "vitest";
import { INPUT_STYLE, LABEL_STYLE } from "../documentEditModalStyleHelpers";

describe("documentEditModalStyleHelpers", () => {
  it("input and label", () => {
    expect(INPUT_STYLE.fontSize).toBe(12);
    expect(LABEL_STYLE.fontSize).toBe(9);
  });
});
