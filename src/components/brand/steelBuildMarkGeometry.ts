/**
 * SteelBuild-Pro hex-S mark — the single source of geometry for the brand mark.
 *
 * The mark is a pointy-top hexagon with an "S" carved out of it by two angled
 * slots. The upper slot opens from the RIGHT edge (so the top bar stays
 * attached on the left) and the lower slot opens from the LEFT edge. That
 * handedness is the whole letter: swap the two and the mark reads as a Z. The
 * slots are 180° rotations of each other about the hexagon centre (256, 256),
 * which is what keeps the S balanced at nav sizes.
 *
 * The three sub-paths are filled as ONE path with `fill-rule="evenodd"` so the
 * slots stay genuinely transparent. That is deliberate: the mark has to sit on
 * SteelBuild Dark, on the light landing page, and on an app-icon tile without
 * three different colour variants. Painting the slots in a background colour
 * instead would show as amber-on-wrong-colour the moment a surface changes.
 *
 * Every slot endpoint that touches x=102 or x=410 is exactly on the hexagon's
 * vertical edge — evenodd only reads cleanly while those stay coincident, so
 * nudge the hexagon and the slots together or not at all.
 */

/** Canvas the geometry is authored in. The hexagon itself spans x 102–410, y 46–466. */
export const MARK_CANVAS = 512;

/** Tight viewBox around the hexagon with a small optical margin — use for a standalone mark. */
export const MARK_VIEWBOX = "86 30 340 452";

/** Full square canvas — use for favicons, app icons and anything sitting on a tile. */
export const MARK_TILE_VIEWBOX = "0 0 512 512";

/** Hexagon outline, then the upper slot (opens right), then the lower slot (opens left). */
export const MARK_PATH = [
  "M256 46 L410 142 L410 370 L256 466 L102 370 L102 142 Z",
  "M410 168 L150 216 L196 246 L410 214 Z",
  "M102 344 L362 296 L316 266 L102 298 Z",
].join(" ");

/** Signal Amber — the mark's own colour, from the SteelBuild-Pro brand palette. */
export const MARK_AMBER = "#F5BB00";

/** Foundry Black — the tile behind the mark on app icons and dark lockups. */
export const MARK_TILE_BG = "#0D1117";
