import { afterEach, describe, expect, it, vi } from "vitest";
import { corsHeaders, isAllowedOrigin, parseAllowedOrigins } from "../cors.ts";

const env = new Map<string, string>();

vi.stubGlobal("Deno", {
  env: { get: (key: string) => env.get(key) },
});

const stagingOrigin = "https://steelbuild-pro-staging.vercel.app";
const previewOrigin = "https://steelbuild-pro-staging-h7gds390x-lorteezy87s-projects.vercel.app";

afterEach(() => {
  env.clear();
});

describe("shared Edge Function CORS", () => {
  it("normalizes configured origins and removes duplicates", () => {
    expect(parseAllowedOrigins(` ${stagingOrigin},${stagingOrigin}, ${previewOrigin} `)).toEqual([
      stagingOrigin,
      previewOrigin,
    ]);
  });

  it("rejects wildcard, malformed, credentialed, and path-bearing values", () => {
    expect(parseAllowedOrigins(`*,javascript:alert(1),${stagingOrigin}/app,https://user:pass@example.com`)).toEqual([]);
  });

  it("treats configured origins as the complete exact allowlist", () => {
    env.set("ALLOWED_ORIGINS", `${stagingOrigin},${previewOrigin}`);

    expect(isAllowedOrigin(stagingOrigin)).toBe(true);
    expect(isAllowedOrigin(previewOrigin)).toBe(true);
    expect(isAllowedOrigin("https://random-preview.vercel.app")).toBe(false);
    expect(isAllowedOrigin("https://steelbuild-pro.com")).toBe(false);

    const allowed = corsHeaders(new Request("https://functions.example.test", {
      headers: { Origin: previewOrigin },
    }));
    const rejected = corsHeaders(new Request("https://functions.example.test", {
      headers: { Origin: "https://random-preview.vercel.app" },
    }));

    expect(allowed["Access-Control-Allow-Origin"]).toBe(previewOrigin);
    expect(rejected["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(rejected.Vary).toBe("Origin");
  });

  it("supports function-specific methods without weakening origin checks", () => {
    env.set("ALLOWED_ORIGINS", stagingOrigin);
    const headers = corsHeaders(new Request("https://functions.example.test", {
      headers: { Origin: stagingOrigin },
    }), "GET, HEAD, OPTIONS");

    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, HEAD, OPTIONS");
    expect(headers["Access-Control-Allow-Origin"]).toBe(stagingOrigin);
  });

  it("keeps legacy permissive behavior only when no allowlist is configured", () => {
    expect(corsHeaders()["Access-Control-Allow-Origin"]).toBe("*");
    expect(isAllowedOrigin("https://random-preview.vercel.app")).toBe(true);
  });
});
