/**
 * env.ts — Centralized, validated environment configuration.
 *
 * Single source of truth for every `import.meta.env.VITE_*` value the browser
 * bundle consumes. Reading env vars in one place gives us:
 *   - Fail-fast startup with an actionable message when required config is
 *     missing or obviously malformed (e.g. an anon key pasted into the URL
 *     slot), instead of an opaque Supabase 401 later.
 *   - One place to document and audit what configuration the app trusts.
 *   - A pure, testable validator (`validateEnv`) decoupled from Vite's
 *     `import.meta.env`, so misconfiguration is covered by unit tests.
 *
 * What belongs here: PUBLIC, browser-safe config only. Supabase anon key and
 * URL and the Sentry DSN are all designed to ship in the client bundle. Service
 * keys, provider API keys, and OAuth secrets must NEVER be VITE_* vars — they
 * live in Supabase Edge Function secrets (see CLAUDE.md §13/§16).
 */

export interface RawEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SENTRY_DSN?: string;
  VITE_APP_VERSION?: string;
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
}

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  sentryDsn: string | null;
  appVersion: string | null;
  mode: string;
  isDev: boolean;
  isProd: boolean;
}

/** Sentry DSN baked in as a safe public fallback (write-only ingest key — not
 *  a secret). Mirrors the fallback in instrument.js so the two never drift. */
export const DEFAULT_SENTRY_DSN =
  "https://6709c2092ebda9743a803919a79c7b46@o4511458803253248.ingest.us.sentry.io/4511458819375104";

export class EnvValidationError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(
      "Invalid environment configuration:\n" +
        problems.map((p) => `  • ${p}`).join("\n") +
        "\n\nSet these in .env.local (local dev) or the Vercel project env " +
        "(deployed). See .env.example for the full list.",
    );
    this.name = "EnvValidationError";
    this.problems = problems;
  }
}

const isNonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Pure validator: takes a raw env bag and returns a normalized AppEnv, or
 * collects every problem and throws a single EnvValidationError. Pure so it can
 * be unit-tested without Vite's import.meta.env.
 *
 * Validation is intentionally lenient on shape (we don't want to reject valid
 * keys on a cosmetic check) but catches the high-frequency real mistakes:
 * missing values, and the URL / key being swapped.
 */
export function validateEnv(raw: RawEnv): AppEnv {
  const problems: string[] = [];

  const url = isNonEmpty(raw.VITE_SUPABASE_URL) ? raw.VITE_SUPABASE_URL.trim() : "";
  const anonKey = isNonEmpty(raw.VITE_SUPABASE_ANON_KEY)
    ? raw.VITE_SUPABASE_ANON_KEY.trim()
    : "";

  if (!url) {
    problems.push("VITE_SUPABASE_URL is missing");
  } else if (!/^https?:\/\//i.test(url)) {
    problems.push(
      `VITE_SUPABASE_URL must be an http(s) URL (got "${truncate(url)}") — ` +
        "did you paste the anon key here by mistake?",
    );
  }

  if (!anonKey) {
    problems.push("VITE_SUPABASE_ANON_KEY is missing");
  } else if (/^https?:\/\//i.test(anonKey)) {
    problems.push(
      "VITE_SUPABASE_ANON_KEY looks like a URL — VITE_SUPABASE_URL and " +
        "VITE_SUPABASE_ANON_KEY appear to be swapped.",
    );
  }

  if (problems.length > 0) {
    throw new EnvValidationError(problems);
  }

  const mode = isNonEmpty(raw.MODE) ? raw.MODE : "production";

  return {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    sentryDsn: isNonEmpty(raw.VITE_SENTRY_DSN) ? raw.VITE_SENTRY_DSN.trim() : null,
    appVersion: isNonEmpty(raw.VITE_APP_VERSION) ? raw.VITE_APP_VERSION.trim() : null,
    mode,
    isDev: raw.DEV === true,
    isProd: raw.PROD === true || mode === "production",
  };
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * The validated, app-wide environment. Reading `import.meta.env` here once means
 * `validateEnv` runs at module load — the first import (the Supabase client)
 * fails fast with a clear message if config is broken.
 */
export const env: AppEnv = validateEnv(import.meta.env as unknown as RawEnv);
