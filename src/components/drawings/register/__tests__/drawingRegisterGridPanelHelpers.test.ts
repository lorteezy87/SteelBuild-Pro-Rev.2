import { describe, expect, it } from "vitest";
import {
  statusTone,
  STATUS_FILTERS,
  RELEASE_OPTIONS,
} from "../drawingRegisterGridPanelHelpers";

describe("drawingRegisterGridPanelHelpers", () => {
  it("status tone", () => {
    expect(statusTone("void")).toBe("danger");
    expect(statusTone(null)).toBe("neutral");
  });
  it("filters and release options", () => {
    expect(STATUS_FILTERS).toContain("released_for_shop");
    expect(RELEASE_OPTIONS.map((o) => o.value)).toContain("released_for_field");
  });
});
