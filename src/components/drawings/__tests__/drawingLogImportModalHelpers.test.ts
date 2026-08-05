import { describe, expect, it } from "vitest";
import { monoStyle, ACCENT } from "../drawingLogImportModalHelpers";

describe("drawing log chrome", () => {
  it("mono and accent", () => {
    expect(monoStyle.fontFamily).toContain("mono");
    expect(ACCENT).toContain("accent");
  });
});
