import { describe, expect, it } from "vitest";
import { EMPTY_TRANSMITTAL_FORM } from "../transmittalLogPanelHelpers";

describe("EMPTY_TRANSMITTAL_FORM", () => {
  it("defaults to incoming", () => {
    expect(EMPTY_TRANSMITTAL_FORM.direction).toBe("incoming");
  });
});
