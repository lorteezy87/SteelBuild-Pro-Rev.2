import { describe, expect, it } from "vitest";
import { FIELD_STYLE, monoLabel } from "../bulkDateEditModalStyleHelpers";

describe("bulkDateEditModalStyleHelpers", () => {
  it("field and label", () => {
    expect(FIELD_STYLE.fontSize).toBe(13);
    expect(monoLabel.fontWeight).toBe(800);
  });
});
