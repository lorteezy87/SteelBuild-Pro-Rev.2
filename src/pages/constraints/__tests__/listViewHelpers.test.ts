import { describe, expect, it } from "vitest";
import { GRID_COLS } from "../listViewHelpers";

describe("listViewHelpers", () => {
  it("grid cols", () => {
    expect(GRID_COLS).toContain("1fr");
  });
});
