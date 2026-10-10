const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { JSDOM } = require("jsdom");

// Parse trusted Vite output without running scripts or loading resources.
// Initial fetches come from actual tags, never inline JSON/strings/comments.
// Keep prefetch and conditional tags conservatively charged to the budget.
function initialHtmlAssets(html) {
  const buildOrigin = "https://steelbuild-build.invalid";
  const scriptTypes = new Set([
    "", "module", "text/javascript", "application/javascript",
    "text/ecmascript", "application/ecmascript", "application/x-ecmascript",
    "application/x-javascript", "text/javascript1.0", "text/javascript1.1",
    "text/javascript1.2", "text/javascript1.3", "text/javascript1.4",
    "text/javascript1.5", "text/jscript", "text/livescript",
    "text/x-ecmascript", "text/x-javascript",
  ]);
  const fetchLinks = new Set(["stylesheet", "modulepreload", "preload", "prefetch"]);
  const dom = new JSDOM(html, { url: `${buildOrigin}/`, contentType: "text/html" });
  const files = new Set();
  try {
    for (const element of dom.window.document.querySelectorAll("script[src],link[href]")) {
      let reference;
      if (element.tagName === "SCRIPT") {
        const type = (element.getAttribute("type") ?? "").trim().toLowerCase().split(";")[0];
        if (!scriptTypes.has(type)) continue;
        reference = element.getAttribute("src");
      } else {
        const relations = (element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
        if (!relations.some((relation) => fetchLinks.has(relation))) continue;
        reference = element.getAttribute("href");
      }
      if (!reference) continue;
      let url;
      try { url = new URL(reference, buildOrigin); } catch { continue; }
      if (url.origin !== buildOrigin || !url.pathname.startsWith("/assets/")) continue;
      const file = url.pathname.slice("/assets/".length);
      if (/^[^/]+\.(?:js|css)$/.test(file)) files.add(file);
    }
    return files;
  } finally {
    dom.window.close();
  }
}

const distAssets = path.join(process.cwd(), "dist", "assets");
const maxInitialGzipKb = Number(process.env.SBP_MAX_INITIAL_GZIP_KB || 320);
const maxTotalGzipKb = Number(process.env.SBP_MAX_TOTAL_GZIP_KB || 3600);

function sizeAsset(file) {
  const fullPath = path.join(distAssets, file);
  const buffer = fs.readFileSync(fullPath);
  return {
    file,
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

const assets = fs.readdirSync(distAssets)
  .filter((file) => /\.(js|css|wasm)$/.test(file))
  .map(sizeAsset)
  .sort((a, b) => b.bytes - a.bytes);

const htmlPath = path.join(process.cwd(), "dist", "index.html");
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
const initialFiles = initialHtmlAssets(html);

const totals = assets.reduce((acc, asset) => {
  acc.bytes += asset.bytes;
  acc.gzip += asset.gzip;
  return acc;
}, { bytes: 0, gzip: 0 });

const initialTotals = assets
  .filter((asset) => initialFiles.has(asset.file))
  .reduce((acc, asset) => {
    acc.bytes += asset.bytes;
    acc.gzip += asset.gzip;
    return acc;
  }, { bytes: 0, gzip: 0 });

console.log("[perf:bundle] Largest generated JS/CSS/WASM assets:");
assets.slice(0, 25).forEach((asset) => {
  console.log(`${kb(asset.bytes).toFixed(1).padStart(8)} KB raw  ${kb(asset.gzip).toFixed(1).padStart(7)} KB gzip  ${asset.file}`);
});

console.log(`\n[perf:bundle] Initial HTML assets: ${kb(initialTotals.bytes).toFixed(1)} KB raw / ${kb(initialTotals.gzip).toFixed(1)} KB gzip`);
console.log(`[perf:bundle] Total generated assets: ${kb(totals.bytes).toFixed(1)} KB raw / ${kb(totals.gzip).toFixed(1)} KB gzip`);
console.log(`[perf:bundle] Budgets: initial <= ${maxInitialGzipKb} KB gzip, total <= ${maxTotalGzipKb} KB gzip`);

if (kb(initialTotals.gzip) > maxInitialGzipKb) {
  fail(`initial gzip budget exceeded: ${kb(initialTotals.gzip).toFixed(1)} KB > ${maxInitialGzipKb} KB`);
}

if (kb(totals.gzip) > maxTotalGzipKb) {
  fail(`total gzip budget exceeded: ${kb(totals.gzip).toFixed(1)} KB > ${maxTotalGzipKb} KB`);
}
