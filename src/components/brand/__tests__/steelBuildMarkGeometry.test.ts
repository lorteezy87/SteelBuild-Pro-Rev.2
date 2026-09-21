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
});
