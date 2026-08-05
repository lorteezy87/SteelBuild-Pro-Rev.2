import { describe, expect, it } from "vitest";
import { REGISTER_GRID_COLS } from "../drawingRegisterTableHelpers";

describe("REGISTER_GRID_COLS", () => {
  it("is a grid template string", () => {
    expect(REGISTER_GRID_COLS).toContain("minmax");
  });
});
