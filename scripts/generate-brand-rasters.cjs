/**
 * generate-brand-rasters — renders the raster brand assets in public/ and the
 * iOS app icon + launch splash in ios/App/App/Assets.xcassets/ from the
 * SteelBuild-Pro hex-S vector.
 *
 * The mark geometry is duplicated here as a string because this script runs
 * under plain node outside the Vite/TS graph; it must stay in sync with
 * src/components/brand/steelBuildMarkGeometry.ts (a test asserts they match).
 *
 * The social-card wordmark is set in DejaVu Sans Bold horizontally compressed
 * to 0.80, because no condensed face ships with the build image. It is a close
 * stand-in for Barlow Condensed at social-card sizes; if a licensed Barlow
 * Condensed export ever lands in the repo, render the wordmark from that
 * instead.
 *
 * Run with: node scripts/generate-brand-rasters.cjs
 */

const path = require("node:path");
const sharp = require("sharp");

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const IOS_ASSETS_DIR = path.resolve(__dirname, "..", "ios", "App", "App", "Assets.xcassets");

/** Social-card pixel size. Must match og:image:width / og:image:height in index.html. */
const SOCIAL_WIDTH = 1200;
const SOCIAL_HEIGHT = 630;

const MARK_PATH = [
  "M256 46 L410 142 L410 370 L256 466 L102 370 L102 142 Z",
  "M158 176 L410 222 L410 250 L200 208 Z",
  "M354 336 L102 290 L102 262 L312 304 Z",
].join(" ");

const AMBER = "#F5BB00";
const FOUNDRY_BLACK = "#0D1117";
/** The web boot shell's field; capacitor.config.ts paints the native splash and webview the same colour. */
const SHELL_BLACK = "#0B0E11";

/** Square canvas the Capacitor launch storyboard aspect-fills onto every iPhone and iPad shape. */
const IOS_SPLASH_SIZE = 2732;

/** Places the 512-canvas mark so its hexagon is `height` tall with its top-left at (x, y). */
function placeMark(height, x, y) {
  const scale = height / 420;
  const tx = x - 102 * scale;
  const ty = y - 46 * scale;
  return `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})"><path fill-rule="evenodd" fill="${AMBER}" d="${MARK_PATH}"/></g>`;
}

const socialCard = `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_WIDTH}" height="${SOCIAL_HEIGHT}" viewBox="0 0 ${SOCIAL_WIDTH} ${SOCIAL_HEIGHT}">
  <rect width="${SOCIAL_WIDTH}" height="${SOCIAL_HEIGHT}" fill="${FOUNDRY_BLACK}"/>
  <rect width="${SOCIAL_WIDTH}" height="6" fill="${AMBER}"/>
  ${placeMark(300, 150, 173)}
  <g transform="translate(400 8)">
    <g transform="translate(0 300) scale(0.80 1)">
      <text x="0" y="0" font-family="DejaVu Sans" font-weight="bold" font-size="104" letter-spacing="-2" fill="#FFFFFF">SteelBuild-Pro</text>
    </g>
    <rect x="2" y="330" width="500" height="3" fill="${AMBER}"/>
    <text x="2" y="376" font-family="DejaVu Sans Mono" font-weight="bold" font-size="22" letter-spacing="6" fill="#98A2B3">BUILT FOR PEOPLE WHO BUILD</text>
    <text x="2" y="432" font-family="DejaVu Sans" font-size="23" letter-spacing="1" fill="#64748B">Structural steel construction management software</text>
  </g>
</svg>`;

async function main() {
  const iconSvg = await require("node:fs/promises").readFile(path.join(PUBLIC_DIR, "favicon.svg"));

  for (const size of [180, 512]) {
    await sharp(iconSvg, { density: 900 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(path.join(PUBLIC_DIR, `steelbuild-pro-icon-${size}.png`));
  }

  // Square app logo kept at its historical filename so any stale reference
  // still serves the current brand rather than the retired diamond mark.
  await sharp(iconSvg, { density: 900 })
    .resize(512, 512)
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, "logo.png"));

  // density 150 oversamples the 1200x630 SVG, then resize brings it back to the
  // declared size — rendering at the 72dpi baseline instead would alias the
  // mark's diagonals. The resize is NOT optional: sharp scales an SVG by
  // density/72, so without it these land at 2500x1313 and contradict the
  // og:image:width / og:image:height in index.html.
  const card = sharp(Buffer.from(socialCard), { density: 150 }).resize(SOCIAL_WIDTH, SOCIAL_HEIGHT);
  await card.clone().png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, "steelbuild-pro-og.png"));
  await card.clone().png({ compressionLevel: 9 }).toFile(path.join(PUBLIC_DIR, "steelbuild-pro-logo.png"));
  await card.clone().jpeg({ quality: 92 }).toFile(path.join(PUBLIC_DIR, "steelbuild-pro-logo.jpg"));

  console.log("Brand rasters regenerated in public/.");

  // iOS app icon: the favicon tile at 1024. App Store Connect rejects an icon
  // with an alpha channel (ITMS-90717) even when every pixel is opaque, so the
  // channel is dropped, not just filled.
  await sharp(iconSvg, { density: 900 })
    .resize(1024, 1024)
    .flatten({ background: FOUNDRY_BLACK })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(IOS_ASSETS_DIR, "AppIcon.appiconset", "AppIcon-512@2x.png"));

  // Launch splash: the mark centred at 20% of the canvas height, small enough
  // to survive the storyboard's aspect-fill crop on a tall iPhone and a
  // landscape iPad alike. The three names are the 1x/2x/3x slots of the
  // Capacitor template's Splash.imageset.
  const markHeight = IOS_SPLASH_SIZE * 0.2;
  const markWidth = (308 / 420) * markHeight;
  const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IOS_SPLASH_SIZE}" height="${IOS_SPLASH_SIZE}" viewBox="0 0 ${IOS_SPLASH_SIZE} ${IOS_SPLASH_SIZE}">
  <rect width="${IOS_SPLASH_SIZE}" height="${IOS_SPLASH_SIZE}" fill="${SHELL_BLACK}"/>
  ${placeMark(markHeight, (IOS_SPLASH_SIZE - markWidth) / 2, (IOS_SPLASH_SIZE - markHeight) / 2)}
</svg>`;
  const splash = sharp(Buffer.from(splashSvg)).flatten({ background: SHELL_BLACK }).removeAlpha();
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) {
    await splash.clone().png({ compressionLevel: 9 }).toFile(path.join(IOS_ASSETS_DIR, "Splash.imageset", name));
  }

  console.log("iOS app icon and launch splash regenerated in ios/App/App/Assets.xcassets/.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
