import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_AMBER, MARK_PATH, MARK_TILE_BG } from "../steelBuildMarkGeometry";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/**
 * The hex-S is drawn in five places that cannot import each other: the React
 * component (via this module), three static SVGs served out of public/, and the
 * plain-node raster generator. A drifted copy means the favicon, the app icon
 * and the nav logo stop being the same logo, which nobody notices until it
 * ships. These tests are the only thing holding them together.
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

  it("keeps the raster generator on the same sub-paths", () => {
    // The script runs under plain node, outside the Vite/TS graph, so it holds
    // its own copy of the three sub-paths rather than importing this module.
    const script = read("scripts/generate-brand-rasters.cjs");
    for (const subPath of MARK_PATH.split(/(?<=Z) /)) {
      expect(script).toContain(subPath);
    }
  });

  it("fills evenodd everywhere so the carved S stays transparent", () => {
    for (const file of STATIC_SVGS) {
      expect(read(file)).toContain('fill-rule="evenodd"');
    }
  });

  it("uses the brand palette's Signal Amber and Foundry Black", () => {
    expect(MARK_AMBER).toBe("#F5BB00");
    expect(MARK_TILE_BG).toBe("#0D1117");
    expect(read("src/styles/brand-theme.css")).toContain("--sbp-signal-amber:          #F5BB00");
    expect(read("src/styles/brand-theme.css")).toMatch(/--brand-amber:\s+var\(--sbp-signal-amber\)/);
  });

  it("leaves the product accent on the approved brand orange", () => {
    const brandCss = read("src/styles/brand-theme.css");
    expect(brandCss).toMatch(/--accent:\s+var\(--brand-orange\)/);
  });

  it("fills the landing-page mark with Signal Amber, not the landing UI accent", () => {
    // The landing page keeps its own executive-light accent (C.amber, #F5A800)
    // for buttons, rules and focus rings. It is close enough to Signal Amber to
    // look right in isolation, which is exactly why passing it to the mark went
    // unnoticed: the public logo rendered a different yellow from the favicon
    // and the in-app logo.
    const landing = read("src/pages/Landing.jsx");
    expect(landing).toContain("<SteelBuildMark size={size} color={MARK_AMBER}");
    expect(landing).not.toMatch(/<SteelBuildMark[^>]*color=\{C\.amber\}/);
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
