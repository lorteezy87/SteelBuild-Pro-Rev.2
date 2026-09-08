/**
 * Drift guard: public/_headers (Cloudflare) must carry the same response
 * headers as vercel.json (Vercel).
 *
 * The app dual-ships to both hosts during the Cloudflare migration. A security
 * header or cache directive added to one file and forgotten in the other means
 * production behaves differently depending on which deployment a user lands
 * on — and the gap is invisible until someone curls both. This test makes the
 * two files fail CI together instead.
 *
 * Retire this test at cutover, when vercel.json is deleted (see
 * docs/runbooks/cloudflare-migration.md).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(__dirname, "..", "..");

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

/** Pull the header set Vercel applies for a given `source` pattern. */
function vercelHeadersFor(source: string): HeaderMap {
  const config = JSON.parse(readFileSync(resolve(repoRoot, "vercel.json"), "utf8"));
  const entry = config.headers.find((h: { source: string }) => h.source === source);
  if (!entry) throw new Error(`vercel.json has no headers entry for source "${source}"`);
  return Object.fromEntries(
    entry.headers.map((h: { key: string; value: string }) => [h.key, h.value]),
  );
}

const cloudflare = parseCloudflareHeaders(
  readFileSync(resolve(repoRoot, "public", "_headers"), "utf8"),
);

describe("public/_headers mirrors vercel.json", () => {
  it("applies the same security headers to every response", () => {
    // Vercel's catch-all source is the regex `/(.*)`; Cloudflare's is `/*`.
    expect(cloudflare["/*"]).toEqual(vercelHeadersFor("/(.*)"));
  });

  it("applies the same immutable caching to hashed build output", () => {
    expect(cloudflare["/assets/*"]).toEqual(vercelHeadersFor("/assets/(.*)"));
  });

  it("still carries the headers the app depends on at runtime", () => {
    // Spelled out rather than derived, so deleting a header from BOTH files
    // (which would keep the mirror tests green) still fails here.
    const globalHeaders = cloudflare["/*"];
    expect(globalHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(globalHeaders["X-Frame-Options"]).toBe("DENY");
    expect(globalHeaders["Strict-Transport-Security"]).toContain("max-age=");
    // CSP stays REPORT-ONLY on both hosts. Promoting it to enforcing is a
    // deliberate, separately-tested change — not something a header edit does
    // by accident.
    expect(globalHeaders).toHaveProperty("Content-Security-Policy-Report-Only");
    expect(globalHeaders).not.toHaveProperty("Content-Security-Policy");

    // public/sw.js serves hashed assets cache-first on the strength of this.
    expect(cloudflare["/assets/*"]["Cache-Control"]).toContain("immutable");

    // REGRESSION GUARD. vercel.json pins Content-Type: application/wasm on
    // /wasm/, and porting that rule to Cloudflare is the obvious-looking move.
    // Do not. Verified against `wrangler dev`: Wrangler already derives
    // application/wasm from the file extension, and a path rule ALSO applies
    // to the SPA fallback — so a missing /wasm/ path returns 200 with
    // index.html in the body labelled application/wasm, which fails
    // instantiateStreaming with a compile error instead of a clean 404.
    // public/_headers explains this at length; keep the two in agreement.
    expect(Object.keys(cloudflare)).not.toContain("/wasm/*");

    // Cloudflare preview URLs are public, unlike Vercel's auth-walled ones.
    expect(cloudflare["https://:version.:subdomain.workers.dev/*"]["X-Robots-Tag"]).toBe(
      "noindex",
    );
  });
});
