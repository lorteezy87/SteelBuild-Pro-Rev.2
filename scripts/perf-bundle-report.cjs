const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const dist = path.join(process.cwd(), "dist");
const distAssets = path.join(dist, "assets");

function budget(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+(?:\.\d+)?$/.test(raw.trim()) || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${name}: expected a positive finite decimal KiB budget`);
  }
  return value;
}

let maxInitialGzipKb, maxTotalGzipKb, maxWasmGzipKb;
try {
  maxInitialGzipKb = budget("SBP_MAX_INITIAL_GZIP_KB", 320);
  // Historical reports excluded dist/wasm. Preserve that JS/CSS limit and
  // account for every WASM copy separately, wherever Vite/public emits it.
  maxTotalGzipKb = budget("SBP_MAX_TOTAL_GZIP_KB", 3600);
  maxWasmGzipKb = budget("SBP_MAX_WASM_GZIP_KB", 500);
} catch (error) {
  console.error(`[perf:bundle] ${error.message}`);
  process.exit(1);
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

function sizeAsset(fullPath) {
  const buffer = fs.readFileSync(fullPath);
  return {
    file: path.relative(dist, fullPath).split(path.sep).join("/"),
    bytes: buffer.length,
    gzip: zlib.gzipSync(buffer).length,
  };
}

function kb(value) {
  return value / 1024;
}

function fail(message) {
  console.error(`\n[perf:bundle] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(distAssets)) {
  console.error("[perf:bundle] dist/assets not found. Run npm run build first.");
  process.exit(1);
}

const assets = filesUnder(dist)
  .filter(file => /\.wasm$/i.test(file) || (file.startsWith(`${distAssets}${path.sep}`) && /\.(js|css)$/i.test(file)))
  .map(sizeAsset)
  .sort((a, b) => b.bytes - a.bytes);
const jsCssAssets = assets.filter(asset => /\.(js|css)$/i.test(asset.file));
const wasmAssets = assets.filter(asset => /\.wasm$/i.test(asset.file));

const htmlPath = path.join(dist, "index.html");
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
const initialFiles = new Set(
  [...html.matchAll(/\/assets\/([^"']+\.(?:js|css))/g)].map((match) => `assets/${match[1]}`)
);

function total(rows) {
  return rows.reduce((acc, asset) => {
    acc.bytes += asset.bytes;
    acc.gzip += asset.gzip;
    return acc;
  }, { bytes: 0, gzip: 0 });
}
const totals = total(assets);
const jsCssTotals = total(jsCssAssets);
const wasmTotals = total(wasmAssets);
const initialTotals = total(jsCssAssets.filter(asset => initialFiles.has(asset.file)));

console.log("[perf:bundle] Largest generated JS/CSS/WASM assets:");
assets.slice(0, 25).forEach((asset) => {
  console.log(`${kb(asset.bytes).toFixed(1).padStart(8)} KiB raw  ${kb(asset.gzip).toFixed(1).padStart(7)} KiB gzip  ${asset.file}`);
});

console.log(`\n[perf:bundle] Initial HTML JS/CSS: ${kb(initialTotals.bytes).toFixed(1)} KiB raw / ${kb(initialTotals.gzip).toFixed(1)} KiB gzip`);
console.log(`[perf:bundle] All generated JS/CSS: ${kb(jsCssTotals.bytes).toFixed(1)} KiB raw / ${kb(jsCssTotals.gzip).toFixed(1)} KiB gzip`);
console.log(`[perf:bundle] WASM across dist (${wasmAssets.length} files): ${kb(wasmTotals.bytes).toFixed(1)} KiB raw / ${kb(wasmTotals.gzip).toFixed(1)} KiB gzip`);
console.log(`[perf:bundle] Combined JS/CSS/WASM: ${kb(totals.bytes).toFixed(1)} KiB raw / ${kb(totals.gzip).toFixed(1)} KiB gzip`);
console.log(`[perf:bundle] Budgets: initial JS/CSS <= ${maxInitialGzipKb} KiB gzip, all JS/CSS <= ${maxTotalGzipKb} KiB gzip, WASM <= ${maxWasmGzipKb} KiB gzip`);

if (kb(initialTotals.gzip) > maxInitialGzipKb) {
  fail(`initial gzip budget exceeded: ${kb(initialTotals.gzip).toFixed(1)} KiB > ${maxInitialGzipKb} KiB`);
}

if (kb(jsCssTotals.gzip) > maxTotalGzipKb) {
  fail(`JS/CSS gzip budget exceeded: ${kb(jsCssTotals.gzip).toFixed(1)} KiB > ${maxTotalGzipKb} KiB`);
}
if (kb(wasmTotals.gzip) > maxWasmGzipKb) {
  fail(`WASM gzip budget exceeded: ${kb(wasmTotals.gzip).toFixed(1)} KiB > ${maxWasmGzipKb} KiB`);
}
