/**
 * env.test.ts — covers the pure validateEnv() configuration validator.
 *
 * Validation logic is decoupled from Vite's import.meta.env so the high-frequency
 * real misconfigurations (missing keys, URL/key swapped) are caught by tests
 * rather than only surfacing as opaque runtime auth failures.
 */

import { describe, it, expect } from "vitest";
import {
  validateEnv,
  EnvValidationError,
  DEFAULT_SENTRY_DSN,
  type RawEnv,
} from "../env";

const GOOD: RawEnv = {
  VITE_SUPABASE_URL: "https://kjrwqagyeswwoxpjkcko.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_abc123",
  MODE: "test",
  DEV: true,
  PROD: false,
};

describe("validateEnv", () => {
  it("returns a normalized AppEnv for valid config", () => {
    const env = validateEnv(GOOD);
    expect(env.supabaseUrl).toBe("https://kjrwqagyeswwoxpjkcko.supabase.co");
    expect(env.supabaseAnonKey).toBe("sb_publishable_abc123");
    expect(env.mode).toBe("test");
    expect(env.isDev).toBe(true);
    expect(env.isProd).toBe(false);
  });

  it("trims surrounding whitespace on url and key", () => {
    const env = validateEnv({
      ...GOOD,
      VITE_SUPABASE_URL: "  https://x.supabase.co  ",
      VITE_SUPABASE_ANON_KEY: "  key  ",
    });
    expect(env.supabaseUrl).toBe("https://x.supabase.co");
    expect(env.supabaseAnonKey).toBe("key");
  });

  it("throws EnvValidationError when the URL is missing", () => {
    expect(() => validateEnv({ ...GOOD, VITE_SUPABASE_URL: undefined })).toThrow(
      EnvValidationError,
    );
  });

  it("throws when the anon key is missing", () => {
    expect(() =>
      validateEnv({ ...GOOD, VITE_SUPABASE_ANON_KEY: "" }),
    ).toThrow(EnvValidationError);
  });

  it("treats whitespace-only values as missing", () => {
    expect(() =>
      validateEnv({ ...GOOD, VITE_SUPABASE_ANON_KEY: "   " }),
    ).toThrow(EnvValidationError);
  });

  it("collects ALL problems into one error", () => {
    try {
      validateEnv({ MODE: "test" });
      throw new Error("expected validateEnv to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const e = err as EnvValidationError;
      expect(e.problems).toHaveLength(2);
      expect(e.problems.some((p) => p.includes("VITE_SUPABASE_URL"))).toBe(true);
      expect(e.problems.some((p) => p.includes("VITE_SUPABASE_ANON_KEY"))).toBe(
        true,
      );
    }
  });

  it("rejects a URL that is not http(s) (anon key pasted into URL slot)", () => {
    expect(() =>
      validateEnv({ ...GOOD, VITE_SUPABASE_URL: "sb_publishable_oops" }),
    ).toThrow(/must be an http\(s\) URL/);
  });

  it("detects URL and key being swapped", () => {
    expect(() =>
      validateEnv({
        ...GOOD,
        VITE_SUPABASE_URL: "https://x.supabase.co",
        VITE_SUPABASE_ANON_KEY: "https://x.supabase.co",
      }),
    ).toThrow(/swapped/);
  });

  it("defaults optional fields to null/sane values", () => {
    const env = validateEnv({
      VITE_SUPABASE_URL: "https://x.supabase.co",
      VITE_SUPABASE_ANON_KEY: "key",
    });
    expect(env.sentryDsn).toBeNull();
    expect(env.appVersion).toBeNull();
    expect(env.mode).toBe("production");
    expect(env.isProd).toBe(true); // mode falls back to production
    expect(env.isDev).toBe(false);
  });

  it("passes through Sentry DSN and app version when present", () => {
    const env = validateEnv({
      ...GOOD,
      VITE_SENTRY_DSN: "https://k@o.ingest.sentry.io/1",
      VITE_APP_VERSION: "abc123",
    });
    expect(env.sentryDsn).toBe("https://k@o.ingest.sentry.io/1");
    expect(env.appVersion).toBe("abc123");
  });

  it("treats MODE=production as prod even without the PROD flag", () => {
    const env = validateEnv({ ...GOOD, MODE: "production", PROD: undefined });
    expect(env.isProd).toBe(true);
  });

  it("exposes a non-empty default Sentry DSN constant", () => {
    expect(DEFAULT_SENTRY_DSN).toMatch(/^https:\/\/.+ingest.*sentry\.io\/\d+$/);
  });
});
