/**
 * optimize-desktop-photos.mjs — turn raw generated images into launcher tiles.
 *
 * Drop your generated images (any size/format: png/jpg/jpeg/webp/avif) into
 *   public/photos/desktop/_raw/
 * naming each by its module — either the exact PageKey (e.g. FabRelease.png) or
 * the human label (e.g. "fab release.png", "schedule of values.jpg"). Then run:
 *   node scripts/optimize-desktop-photos.mjs
 *
 * For each matched file it center-crops to 3:2, resizes to 1536x1024, encodes
 * WebP under ~180KB, and writes public/photos/desktop/<PageKey>.webp — which the
 * launcher (PHOTO_ASSETS / ModuleTile) picks up automatically on reload.
 *
 * sharp is installed once into scripts/.imgtools (gitignored) so the repo's
 * package.json is left untouched.
 */
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const rawDir = path.join(repoRoot, "public", "photos", "desktop", "_raw");
const outDir = path.join(repoRoot, "public", "photos", "desktop");
const toolsDir = path.join(__dirname, ".imgtools");

const WIDTH = 1536;
const HEIGHT = 1024; // 3:2
const MAX_BYTES = 180 * 1024;
const QUALITY_LADDER = [80, 72, 64, 56, 48, 42];

// PageKey -> accepted aliases (matched case/space/punctuation-insensitive).
const ALIASES = {
  Dashboard: ["Dashboard"],
  CommandCenter: ["Command Center"],
  PortfolioHub: ["Portfolio Overview", "Portfolio"],
  ProjectsHub: ["Projects"],
  DrawingSubmittalHub: ["Detailing", "Detailing Control Center", "Drawings"],
  ScheduleHub: ["Schedule"],
  RFIs: ["RFIs", "RFI"],
  ActionItems: ["Action Items"],
  WorkPackages: ["Work Packages"],
  FabRelease: ["Fab Release"],
  ProductionStatus: ["Production Status"],
  Procurement: ["Procurement"],
  BudgetHours: ["Budget Hours"],
  RiskHub: ["Risk"],
  ResourceHub: ["Resources"],
  Deliveries: ["Deliveries"],
  FieldToday: ["Field Today"],
  FieldHub: ["Field Hub"],
  CostHub: ["Budget Control", "Cost"],
  ChangeOrders: ["Change Orders"],
  SOV: ["Schedule of Values", "SOV"],
  PayApplications: ["Pay Application", "Pay Applications"],
  Backcharges: ["Backcharge Defense", "Backcharges", "Backcharge Defenses"],
  Expenses: ["Expenses"],
  Documents: ["Documents"],
  ReportsHub: ["Reports"],
  OrgMembers: ["Team"],
  Billing: ["Billing"],
  Vendors: ["Vendors"],
  Settings: ["Settings"],
  CalculatorsHub: ["Calculators"],
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// normalized-name -> PageKey
const LOOKUP = {};
for (const [page, names] of Object.entries(ALIASES)) {
  LOOKUP[norm(page)] = page;
  for (const n of names) LOOKUP[norm(n)] = page;
}

function ensureSharp() {
  try { return require(path.join(toolsDir, "node_modules", "sharp")); } catch { /* not yet */ }
  console.log("Installing sharp (one-time) into scripts/.imgtools …");
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.writeFileSync(
    path.join(toolsDir, "package.json"),
    JSON.stringify({ name: "imgtools", private: true, version: "0.0.0" }, null, 2),
  );
  execSync("npm install sharp@^0.34.0 --no-audit --no-fund --loglevel=error", {
    cwd: toolsDir, stdio: "inherit",
  });
  return require(path.join(toolsDir, "node_modules", "sharp"));
}

async function encodeUnderCap(sharp, inputPath) {
  const base = sharp(inputPath).resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" });
  let last = null;
  for (const quality of QUALITY_LADDER) {
    const buf = await base.clone().webp({ quality, effort: 5 }).toBuffer();
    last = buf;
    if (buf.length <= MAX_BYTES) return { buf, quality };
  }
  return { buf: last, quality: QUALITY_LADDER[QUALITY_LADDER.length - 1] };
}

async function main() {
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
    console.log(`Created ${path.relative(repoRoot, rawDir)} — drop your images there and re-run.`);
    return;
  }
  const sharp = ensureSharp();

  const exts = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
  const files = fs.readdirSync(rawDir).filter((f) => exts.has(path.extname(f).toLowerCase()));

  const placed = [];
  const unmatched = [];
  for (const file of files) {
    const key = LOOKUP[norm(path.basename(file, path.extname(file)))];
    if (!key) { unmatched.push(file); continue; }
    const { buf, quality } = await encodeUnderCap(sharp, path.join(rawDir, file));
    const outPath = path.join(outDir, `${key}.webp`);
    fs.writeFileSync(outPath, buf);
    placed.push({ file, key, kb: Math.round(buf.length / 1024), quality });
  }

  console.log(`\nPlaced ${placed.length} tile photo(s):`);
  for (const p of placed) console.log(`  ${p.file}  ->  ${p.key}.webp  (${p.kb} KB, q${p.quality})`);
  if (unmatched.length) {
    console.log(`\nUnmatched (skipped) — rename to a PageKey or label:`);
    for (const u of unmatched) console.log(`  ${u}`);
  }
  const have = new Set(placed.map((p) => p.key));
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".webp")) have.add(path.basename(f, ".webp"));
  }
  const missing = Object.keys(ALIASES).filter((k) => !have.has(k));
  console.log(`\n${have.size}/${Object.keys(ALIASES).length} module photos present.`);
  if (missing.length) console.log(`Still missing: ${missing.join(", ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
