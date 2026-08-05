import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { resolveE2EEnvironment } from "./environment";

/**
 * Sign in ONCE via the Supabase API and seed the resulting session into the app
 * origin's localStorage, then persist Playwright storageState so every spec
 * runs authenticated. Far more robust than driving the login modal — no
 * UI-selector coupling.
 *
 * The app creates its Supabase client with the DEFAULT storage key (there is no
 * custom `storageKey` in src/lib/supabase.ts), which is `sb-<ref>-auth-token`.
 * supabase-js v2 persists the session object as JSON under that key, so the app
 * reads exactly what we seed here.
 *
 * Required env (see e2e/README.md):
 *   E2E_USER, E2E_PASS                                  dedicated test account
 *   E2E_SUPABASE_URL      | VITE_SUPABASE_URL           project URL
 *   E2E_SUPABASE_ANON_KEY | VITE_SUPABASE_ANON_KEY      anon key (public)
 *   E2E_BASE_URL                                        app origin (default prod)
 */
const STORAGE_PATH = "e2e/.auth/state.json";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const environment = resolveE2EEnvironment();

  const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: environment.email,
    password: environment.password,
  });
  if (error || !data.session) {
    throw new Error(
      `E2E sign-in failed: ${error?.message || "no session returned"}`,
    );
  }

  const storageKey = `sb-${environment.supabaseRef}-auth-token`;
  const sessionValue = JSON.stringify(data.session);
  const origin = environment.baseUrl;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Land on the origin so localStorage is scoped to it, seed the session,
    // then capture storageState for the specs.
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([key, value]) => window.localStorage.setItem(key, value),
      [storageKey, sessionValue] as [string, string],
    );
    mkdirSync("e2e/.auth", { recursive: true });
    await context.storageState({ path: STORAGE_PATH });
  } finally {
    await browser.close();
  }
}
