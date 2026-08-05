import { describe, expect, it } from "vitest";
import { monoStyle, displayStyle, ACCENT } from "../teklaEpmImportModalHelpers";

describe("tekla epm chrome", () => {
  it("atoms", () => {
    expect(monoStyle.fontFamily).toContain("mono");
    expect(displayStyle.fontFamily).toContain("Space Grotesk");
    expect(ACCENT).toContain("accent");
  });
});
