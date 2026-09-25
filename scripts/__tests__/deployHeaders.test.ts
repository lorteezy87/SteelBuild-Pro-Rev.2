/**
 * public/_headers is the ONLY place the deployed app's response headers are
 * defined. There is no second host to cross-check against any more: vercel.json
 * used to carry these rules and this test used to assert the two agreed, but
 * the Vercel account is gone and that file with it.
 *
 * So this file is no longer a drift guard — it is the contract. If a header
 * silently disappears from `_headers`, nothing else in the repo notices and the
 * only symptom is a production response missing a security header months later.
 * Each assertion below records WHY the header is there, so a future edit that
 * removes one has to argue with a specific reason rather than a bare string.
 *
 * Cloudflare `_headers` reference:
 * https://developers.cloudflare.com/workers/static-assets/headers/
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");

/**
 * CSP hashes cover the bytes BETWEEN the script tags, exactly as authored —
 * which is what makes them so easy to invalidate by accident. Recomputing them
 * here means an edit to index.html's inline bootstrap fails this test with the
 * replacement hash in the diff, instead of silently un-allowing the script.
 */
function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>(.*?)<\/script>/gs)].map(
    (m) => `sha256-${createHash("sha256").update(m[1]).digest("base64")}`,
  );
}

const indexHtml = readFileSync(resolve(repoRoot, "index.html"), "utf8");

type HeaderMap = Record<string, string>;

/** Parse the Cloudflare `_headers` format into { pathPattern: { name: value } }. */
function parseCloudflareHeaders(text: string): Record<string, HeaderMap> {
  const blocks: Record<string, HeaderMap> = {};
  let current: string | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (line.trim() === "" || line.trim().startsWith("#")) continue;

    // Indented lines are `Name: value` pairs belonging to the block above.
    if (/^\s/.test(line)) {
      if (!current) throw new Error(`header line before any path pattern: ${line}`);
      const idx = line.indexOf(":");
      if (idx === -1) throw new Error(`malformed header line: ${line}`);
      const name = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      blocks[current][name] = value;
      continue;
    }

    // Un-indented, non-comment lines start a new block.
    current = line.trim();
    blocks[current] ??= {};
  }

  return blocks;
}

const cloudflare = parseCloudflareHeaders(
  readFileSync(resolve(repoRoot, "public", "_headers"), "utf8"),
);

describe("public/_headers", () => {
  it("sends the security headers on every response", () => {
    const h = cloudflare["/*"];
    expect(h, "the catch-all `/*` block is missing entirely").toBeDefined();

    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    // The app asks for none of these; denying them keeps a compromised
    // dependency from prompting a field user for a microphone or USB device.
    expect(h["Permissions-Policy"]).toContain("microphone=()");
  });

  it("enforces the reviewed CSP without changing its required source allowances", () => {
    const h = cloudflare["/*"];
    expect(h).toHaveProperty("Content-Security-Policy");
    expect(h).not.toHaveProperty("Content-Security-Policy-Report-Only");

    const csp = h["Content-Security-Policy"];
    // Sources the app genuinely needs; dropping any of these breaks a feature.
    expect(csp, "Supabase REST/auth/storage").toContain("https://*.supabase.co");
    expect(csp, "Supabase realtime websockets").toContain("wss://*.supabase.co");
    expect(csp, "Stripe billing").toContain("https://js.stripe.com");
    // web-ifc compiles WebAssembly at runtime; without this the 3D viewer dies.
    expect(csp, "web-ifc WebAssembly").toContain("'wasm-unsafe-eval'");
    // Violations are only useful if they are actually reported somewhere.
    expect(csp, "violation reporting endpoint").toContain("report-uri");
  });

  it("allows every inline script index.html actually ships", () => {
    // Production was reporting a script-src violation on every page load: the
    // anti-FOUC theme bootstrap in index.html is inline (it must run before
    // first paint) and nothing allowed it. Report-Only hid that — enforcing the
    // policy as written would have blocked it and brought the flash back.
    //
    // Recomputed from index.html rather than hard-coded, so editing that script
    // fails HERE with the new hash rather than in production months later.
    const csp = cloudflare["/*"]["Content-Security-Policy"];
    const hashes = inlineScriptHashes(indexHtml);

    expect(hashes.length, "index.html has no inline <script> — is the hash still needed?").toBeGreaterThan(0);
    for (const hash of hashes) {
      expect(
        csp,
        `index.html ships an inline script that script-src does not allow.\n` +
          `Add '${hash}' to script-src in public/_headers.`,
      ).toContain(`'${hash}'`);
    }
    // A hash is only meaningful while 'unsafe-inline' is absent — browsers
    // ignore hashes entirely once it is present.
    expect(csp, "'unsafe-inline' in script-src would make the hashes dead weight")
      .not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("allows the Cloudflare Web Analytics beacon Cloudflare injects itself", () => {
    // Nothing in this repo requests this script; Cloudflare adds it at the edge
    // when the feature is enabled for the zone. It was the second violation
    // reported on every page load.
    const csp = cloudflare["/*"]["Content-Security-Policy"];
    expect(csp, "beacon script origin").toContain("https://static.cloudflareinsights.com");
    // Allowing the script without its reporting endpoint just moves the
    // violation from script-src to connect-src.
    expect(csp, "beacon RUM endpoint").toContain("https://cloudflareinsights.com");
  });

  it("caches hashed build output immutably", () => {
    // Workers defaults static assets to `max-age=0, must-revalidate`. Without
    // this rule every bundle revalidates on every load, and public/sw.js's
    // cache-first branch for hashed assets is built on the assumption that
    // these URLs can never change content.
    expect(cloudflare["/assets/*"]?.["Cache-Control"]).toContain("immutable");
  });

  it("does NOT pin a Content-Type on /wasm/", () => {
    // REGRESSION GUARD — this rule looks obviously correct and is not.
    // Verified against `wrangler dev`: Wrangler already derives
    // application/wasm from the file extension, so the real web-ifc.wasm is
    // typed correctly with no rule. But a path rule ALSO applies to the SPA
    // fallback, so with the rule in place a request for a /wasm/ path that
    // does not exist returned 200 with index.html in the body labelled
    // application/wasm — instantiateStreaming then fails on a confusing
    // compile error instead of a clean 404.
    //
    // The IFC viewer renders zero geometry with no error on a bad WASM
    // response, so this rule causes the exact failure it appears to prevent.
    expect(Object.keys(cloudflare)).not.toContain("/wasm/*");
  });

  it("keeps workers.dev preview URLs out of search results", () => {
    // Cloudflare preview URLs are public. This is a backstop, not access
    // control — Cloudflare Access is the real answer (see the runbook).
    expect(
      cloudflare["https://:version.:subdomain.workers.dev/*"]?.["X-Robots-Tag"],
    ).toBe("noindex");
  });
});
