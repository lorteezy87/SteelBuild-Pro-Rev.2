import { describe, expect, it } from "vitest";
import { cssColorToHex } from "../statusBarColor";

describe("cssColorToHex", () => {
  it("converts the computed page colours of both themes", () => {
    // --bg-page: SteelBuild Dark and the light theme (src/styles/tokens.css).
    expect(cssColorToHex("rgb(11, 14, 17)")).toBe("#0B0E11");
    expect(cssColorToHex("rgb(241, 245, 249)")).toBe("#F1F5F9");
  });

  it("accepts an opaque rgba() and the space-separated syntax", () => {
    expect(cssColorToHex("rgba(5, 8, 16, 1)")).toBe("#050810");
    expect(cssColorToHex("rgb(5 8 16)")).toBe("#050810");
    expect(cssColorToHex("rgb(5 8 16 / 100%)")).toBe("#050810");
  });

  it("refuses to guess at a transparent or unparseable colour", () => {
    // A transparent body would otherwise paint the strip black: the bug this
    // helper exists to prevent.
    expect(cssColorToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(cssColorToHex("transparent")).toBeNull();
    expect(cssColorToHex("color(display-p3 1 0 0)")).toBeNull();
    expect(cssColorToHex("rgb(300, 0, 0)")).toBeNull();
    expect(cssColorToHex("")).toBeNull();
  });
});
