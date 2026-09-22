import { afterEach, describe, expect, it, vi } from "vitest";
import { IOS_APP_ORIGIN, corsHeaders, isAllowedOrigin, isNativeAppOrigin, parseAllowedOrigins } from "../cors.ts";

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

  // Previously: with no ALLOWED_ORIGINS the helper emitted `*` and matched any
  // *.vercel.app host. Both are removed — an unset secret now degrades to the
  // fixed production + loopback list, never to "anyone". stripe-billing feeds
  // isAllowedOrigin() into Checkout redirect URLs, so a pattern match here was
  // a post-payment open redirect.
  describe("with no ALLOWED_ORIGINS configured", () => {
    it("never emits a wildcard Access-Control-Allow-Origin", () => {
      expect(corsHeaders()["Access-Control-Allow-Origin"]).toBeUndefined();
      const unknown = corsHeaders(new Request("https://functions.example.test", {
        headers: { Origin: "https://evil.example.com" },
      }));
      expect(unknown["Access-Control-Allow-Origin"]).toBeUndefined();
      expect(unknown.Vary).toBe("Origin");
    });

    it("refuses arbitrary vercel.app hosts", () => {
      expect(isAllowedOrigin("https://random-preview.vercel.app")).toBe(false);
      expect(isAllowedOrigin(stagingOrigin)).toBe(false);
      expect(isAllowedOrigin(previewOrigin)).toBe(false);
    });

    it("still allows production and loopback so dev and prod keep working", () => {
      expect(isAllowedOrigin("https://steelbuild-pro.com")).toBe(true);
      expect(isAllowedOrigin("https://www.steelbuild-pro.com")).toBe(true);
      expect(isAllowedOrigin("http://localhost:5173")).toBe(true);

      const prod = corsHeaders(new Request("https://functions.example.test", {
        headers: { Origin: "https://steelbuild-pro.com" },
      }));
      expect(prod["Access-Control-Allow-Origin"]).toBe("https://steelbuild-pro.com");
    });

    it("does not allow loopback on an unlisted port", () => {
      expect(isAllowedOrigin("http://localhost:9999")).toBe(false);
    });

    it("allows the iOS app, whose origin is a custom scheme", () => {
      // WKWebView sends the Capacitor origin verbatim. new URL() would turn it
      // into the opaque origin "null", so parsing it could never match.
      expect(new URL(IOS_APP_ORIGIN).origin).toBe("null");
      expect(isAllowedOrigin(IOS_APP_ORIGIN)).toBe(true);

      const app = corsHeaders(new Request("https://functions.example.test", {
        headers: { Origin: IOS_APP_ORIGIN },
      }));
      expect(app["Access-Control-Allow-Origin"]).toBe(IOS_APP_ORIGIN);
    });
  });

  describe("native app origin", () => {
    it("is honoured in ALLOWED_ORIGINS and still exact", () => {
      expect(parseAllowedOrigins(`${stagingOrigin}, Capacitor://LOCALHOST`)).toEqual([stagingOrigin, IOS_APP_ORIGIN]);
      // Only the one Capacitor origin: no other custom scheme, host or path.
      expect(parseAllowedOrigins("capacitor://evil.example,ionic://localhost,capacitor://localhost/app")).toEqual([]);
    });

    it("is refused when a configured allowlist leaves it out", () => {
      // ALLOWED_ORIGINS is the complete list: setting it without the app's
      // origin cuts the app off, exactly as it would a web origin.
      env.set("ALLOWED_ORIGINS", stagingOrigin);
      expect(isAllowedOrigin(IOS_APP_ORIGIN)).toBe(false);
    });

    it("is recognised so it never becomes a redirect target", () => {
      expect(isNativeAppOrigin(IOS_APP_ORIGIN)).toBe(true);
      expect(isNativeAppOrigin(" CAPACITOR://localhost ")).toBe(true);
      expect(isNativeAppOrigin("https://steelbuild-pro.com")).toBe(false);
      expect(isNativeAppOrigin(null)).toBe(false);
    });
  });
});
