import { describe, expect, it } from "vitest";
import { monoStyle } from "../operationsPageShellHelpers";

describe("operationsPageShellHelpers", () => {
  it("mono", () => {
    expect(monoStyle.fontFamily).toContain("mono");
  });
});
