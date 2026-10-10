import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const asset = (path: string) => resolve(process.cwd(), path);
const text = (path: string) => readFileSync(asset(path), "utf8");
const iconUrl = (name: string) => {
  const hash = createHash("sha256").update(readFileSync(asset(`public/${name}`))).digest("hex").slice(0, 12);
  return `/${name}?v=${hash}`;
};

describe("approved steel diamond badge assets", () => {
  it("keeps the high-resolution marketing badge as the shared source", async () => {
    const source = await sharp(asset("public/marketing/steelbuild-pro-logo.jpg")).metadata();
    expect({ width: source.width, height: source.height }).toEqual({ width: 1248, height: 832 });
    expect(text("scripts/generate-brand-rasters.cjs"))
      .toContain('"marketing", "steelbuild-pro-logo.jpg"');
  });

  it.each([
    ["public/favicon-64.png", 64, 64],
    ["public/steelbuild-pro-icon-180.png", 180, 180],
    ["public/steelbuild-pro-icon-192.png", 192, 192],
    ["public/steelbuild-pro-icon-512.png", 512, 512],
    ["public/steelbuild-pro-icon-maskable-512.png", 512, 512],
    ["public/steelbuild-pro-og.png", 1200, 630],
    ["ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024, 1024],
    ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", 2732, 2732],
    ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png", 2732, 2732],
    ["ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png", 2732, 2732],
  ])("exports %s at its declared dimensions", async (path, width, height) => {
    const metadata = await sharp(asset(path)).metadata();
    expect({ width: metadata.width, height: metadata.height }).toEqual({ width, height });
    expect(metadata.format).toBe("png");
    if (path.includes("AppIcon.appiconset")) expect(metadata.hasAlpha).toBe(false);
  });

  it("serves the badge through app shell, browser icon, and versioned installed-app icons", () => {
    const html = text("index.html");
    const manifest = JSON.parse(text("public/manifest.json")) as { icons: { src: string }[] };
    expect(html).toContain("/marketing/steelbuild-pro-logo.jpg");
    expect(html).toContain("/favicon-64.png");
    expect(html).toContain(iconUrl("steelbuild-pro-icon-180.png"));
    expect(manifest.icons.map(({ src }) => src)).toEqual(expect.arrayContaining([
      "/steelbuild-pro-icon-192.png",
      iconUrl("steelbuild-pro-icon-512.png"),
      "/steelbuild-pro-icon-maskable-512.png",
    ]));
  });

  it("precaches only the approved badge and current installed-app icons", () => {
    const serviceWorker = text("public/sw.js");
    expect(serviceWorker).toContain('"/marketing/steelbuild-pro-logo.jpg"');
    expect(serviceWorker).toContain('"/favicon-64.png"');
    expect(serviceWorker).toContain('"/steelbuild-pro-icon-maskable-512.png"');
    expect(serviceWorker).not.toContain('"/favicon.svg"');
    expect(serviceWorker).not.toContain('"/icon-maskable.svg"');
    expect(serviceWorker).not.toContain('"/steelbuild-pro-mark.svg"');
  });
});
