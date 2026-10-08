import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_AMBER, MARK_PATH, MARK_TILE_BG } from "../steelBuildMarkGeometry";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * Historical hex-S assets remain in the repository for compatibility. The
 * approved steel diamond badge now owns every active logo and raster export.
 * Keep legacy geometry internally consistent without reconnecting it to the
 * app identity.
 */
describe("SteelBuild-Pro hex-S mark geometry", () => {
  const STATIC_SVGS = [
    "public/steelbuild-pro-mark.svg",
    "public/favicon.svg",
    "public/icon-maskable.svg",
  ];

  it.each(STATIC_SVGS)("%s draws the same path as the component", (file) => {
    expect(squash(read(file))).toContain(MARK_PATH);
  });

  it("generates current rasters from the approved badge instead of the retired paths", () => {
    const script = read("scripts/generate-brand-rasters.cjs");
    expect(script).toContain('"marketing", "steelbuild-pro-logo.jpg"');
    expect(script).not.toContain("MARK_PATH");
  });

  it("fills evenodd everywhere so the carved S stays transparent", () => {
    for (const file of STATIC_SVGS) {
      expect(read(file)).toContain('fill-rule="evenodd"');
    }
  });

  it("retains the historical palette without coloring the approved badge", () => {
    expect(MARK_AMBER).toBe("#F5BB00");
    expect(MARK_TILE_BG).toBe("#0D1117");
    expect(read("src/styles/brand-theme.css")).toContain("--sbp-signal-amber:          #F5BB00");
    expect(read("src/styles/brand-theme.css")).not.toMatch(/--brand-amber:/);
  });

  it("leaves the product accent on the approved brand orange", () => {
    const brandCss = read("src/styles/brand-theme.css");
    expect(brandCss).toMatch(/--accent:\s+var\(--brand-orange\)/);
  });

});

/** Width and height out of a PNG's IHDR chunk, which always starts at byte 16. */
function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(resolve(process.cwd(), rel));
  expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("social card", () => {
  it("is committed at the size index.html advertises", () => {
    // sharp scales an SVG by density/72, so rasterising the 1200x630 card at
    // density 150 without a resize silently produced 2500x1313 files while the
    // Open Graph tags kept claiming 1200x630.
    const html = read("index.html");
    const width = Number(html.match(/og:image:width" content="(\d+)"/)?.[1]);
    const height = Number(html.match(/og:image:height" content="(\d+)"/)?.[1]);
    expect({ width, height }).toEqual({ width: 1200, height: 630 });

    expect(pngSize("public/steelbuild-pro-og.png")).toEqual({ width, height });
    expect(pngSize("public/steelbuild-pro-logo.png")).toEqual({ width, height });
  });

  it("points the Open Graph tags at the generated card", () => {
    expect(read("index.html")).toContain('og:image" content="https://steelbuild-pro.com/steelbuild-pro-og.png"');
  });
});
