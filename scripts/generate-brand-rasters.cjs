/**
 * Render install icons and social previews from the exact approved badge.
 * The source is public/marketing/steelbuild-pro-logo.jpg. These exports only
 * scale and letterbox that image; they never redraw or crop its lettering.
 *
 * Run with: node scripts/generate-brand-rasters.cjs
 */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SOURCE = path.join(PUBLIC, "marketing", "steelbuild-pro-logo.jpg");
const NATIVE_ASSETS = path.join(ROOT, "ios", "App", "App", "Assets.xcassets");
const BACKGROUND = { r: 11, g: 14, b: 17, alpha: 1 };

async function badgeOnCanvas(width, height, badgeWidth) {
  const { data, info } = await sharp(SOURCE)
    .resize({ width: badgeWidth })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // The original JPG's textured black margin differs slightly from the icon
  // field. Fade only that outer margin, well before the steel plate begins.
  const feather = Math.max(1, Math.round(badgeWidth * 0.018));
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const distance = Math.min(x, y, info.width - 1 - x, info.height - 1 - y);
      if (distance >= feather) continue;
      data[(y * info.width + x) * 4 + 3] = Math.round(255 * distance / feather);
    }
  }
  const badge = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
  return sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
    .composite([{ input: badge, gravity: "centre" }])
    .png({ palette: true, colours: 256, dither: 0.8, effort: 10 })
    .toBuffer();
}

async function writeIcon(filename, size, badgeWidth) {
  await fs.writeFile(path.join(PUBLIC, filename), await badgeOnCanvas(size, size, badgeWidth));
}

async function main() {
  const sourceMeta = await sharp(SOURCE).metadata();
  if (sourceMeta.width !== 1248 || sourceMeta.height !== 832) {
    throw new Error("The approved steel diamond badge source changed dimensions; review the exports before shipping.");
  }

  await writeIcon("favicon-64.png", 64, 62);
  await writeIcon("steelbuild-pro-icon-180.png", 180, 170);
  await writeIcon("steelbuild-pro-icon-192.png", 192, 182);
  await writeIcon("steelbuild-pro-icon-512.png", 512, 486);
  await writeIcon("steelbuild-pro-icon-maskable-512.png", 512, 392);
  await writeIcon("logo.png", 512, 486); // historical app-icon path

  const social = await badgeOnCanvas(1200, 630, 942);
  await fs.writeFile(path.join(PUBLIC, "steelbuild-pro-og.png"), social);
  await fs.writeFile(path.join(PUBLIC, "steelbuild-pro-logo.png"), social);
  await sharp(social).jpeg({ quality: 91 }).toFile(path.join(PUBLIC, "steelbuild-pro-logo.jpg"));

  const nativeIcon = await badgeOnCanvas(1024, 1024, 972);
  await fs.writeFile(path.join(NATIVE_ASSETS, "AppIcon.appiconset", "AppIcon-512@2x.png"), nativeIcon);

  // LaunchScreen.storyboard uses scaleAspectFill. At 9:19.5 phone aspect this
  // width leaves clear side space after the square canvas is cropped.
  const splash = await badgeOnCanvas(2732, 2732, 1200);
  const splashDir = path.join(NATIVE_ASSETS, "Splash.imageset");
  await Promise.all([
    "splash-2732x2732.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732-2.png",
  ].map((name) => fs.writeFile(path.join(splashDir, name), splash)));

  console.log("Steel diamond badge icons and previews rendered from the approved source.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
