import { describe, expect, it } from "vitest";

import { safeHref } from "../safeHref";

describe("safeHref", () => {
  it("passes absolute http(s), mailto and tel links", () => {
    expect(safeHref("https://drive.google.com/drive/folders/abc")).toBe("https://drive.google.com/drive/folders/abc");
    expect(safeHref("  http://example.com/a b ")).toBe("http://example.com/a%20b");
    expect(safeHref("mailto:pm@example.com")).toBe("mailto:pm@example.com");
    expect(safeHref("tel:+16025550100")).toBe("tel:+16025550100");
  });

  it("rejects script and data schemes, however they are disguised", () => {
    for (const value of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "  javascript:alert(1)",
      "java\tscript:alert(1)",
      "java\nscript:alert(1)",
      "\u0000javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(safeHref(value), JSON.stringify(value)).toBeUndefined();
    }
  });

  it("returns undefined for relative paths, blanks and non-strings", () => {
    expect(safeHref("project-1/photos/a.jpg")).toBeUndefined();
    expect(safeHref("/Dashboard")).toBeUndefined();
    expect(safeHref("")).toBeUndefined();
    expect(safeHref("   ")).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref(42)).toBeUndefined();
  });
});
