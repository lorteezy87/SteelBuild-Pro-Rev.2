const targetUrl = process.argv[2] || process.env.SBP_PERF_URL || "http://localhost:5173/Dashboard";
const viewport = {
  width: Number(process.env.SBP_PERF_WIDTH || 1440),
  height: Number(process.env.SBP_PERF_HEIGHT || 1000),
};

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("[perf:trace] Playwright is not installed in this checkout.");
  console.error("[perf:trace] Install or run with an environment that provides Playwright, then retry:");
  console.error(`[perf:trace]   npm run perf:trace -- ${targetUrl}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport });
const consoleMessages = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => {
  consoleMessages.push({ type: "pageerror", text: error.message });
});

const started = Date.now();
await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 60000 });
const elapsedMs = Date.now() - started;

const perf = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const byType = resources.reduce((acc, item) => {
    const type = item.initiatorType || "other";
    const transferSize = Number(item.transferSize) || 0;
    acc[type] = (acc[type] || 0) + transferSize;
    return acc;
  }, {});
  return {
    title: document.title,
    url: location.href,
    domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadEventMs: nav ? Math.round(nav.loadEventEnd) : null,
    transferByType: byType,
    resourceCount: resources.length,
  };
});

console.log(JSON.stringify({
  targetUrl,
  viewport,
  elapsedMs,
  perf,
  consoleMessages: consoleMessages.slice(0, 25),
}, null, 2));

await browser.close();
