import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// account-delete keeps its own CORS constant (origin `*`) instead of the shared
// allowlist helper. Its header list once omitted x-client-info, which
// supabase-js sends on every functions.invoke(), so the browser failed the
// preflight and in-app account deletion (App Store Guideline 5.1.1(v)) and
// workspace deletion never reached the function on the web or in the iOS app.
const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

function headerList(source: string, pattern: RegExp): string[] {
  const match = source.match(pattern);
  expect(match, String(pattern)).not.toBeNull();
  return (match?.[1] ?? "").split(",").map((header) => header.trim().toLowerCase()).filter(Boolean);
}

describe("account-delete CORS", () => {
  const allowed = headerList(
    read("supabase/functions/account-delete/index.ts"),
    /"access-control-allow-headers":\s*"([^"]+)"/,
  );

  it("allows every header supabase-js sends from functions.invoke()", () => {
    for (const header of ["authorization", "apikey", "content-type", "x-client-info"]) {
      expect(allowed).toContain(header);
    }
  });

  it("allows everything the shared Edge Function CORS helper allows", () => {
    const shared = headerList(read("supabase/functions/_shared/cors.ts"), /const ALLOW_HEADERS =\s*"([^"]+)"/);
    // Sentry's sentry-trace/baggage and x-supabase-auth reach every function
    // the same way; webhook-only headers are the shared helper's business.
    for (const header of shared.filter((name) => !["stripe-signature", "x-webhook-secret"].includes(name))) {
      expect(allowed).toContain(header);
    }
  });
});
