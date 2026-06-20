import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase sign-in fixtures for API-level E2E specs (no browser). Each creates a
 * fresh anon client and signs in with a password, returning the AUTHENTICATED
 * client so a spec can drive the real client → RLS → trigger boundary that the
 * in-process Vitest suite can't reach (it mocks supabase).
 *
 * Reuses the same env as e2e/global-setup.ts (the anon key is browser-public;
 * the passwords are secrets — keep them in a secret store, never in the repo):
 *   E2E_USER / E2E_PASS                              the pm+ test account
 *   E2E_VIEWER_USER / E2E_VIEWER_PASS                optional viewer-role account
 *   E2E_SUPABASE_URL      | VITE_SUPABASE_URL        project URL
 *   E2E_SUPABASE_ANON_KEY | VITE_SUPABASE_ANON_KEY   anon key (public)
 */
const SUPABASE_URL =
  process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON =
  process.env.E2E_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

export interface SignedInUser {
  /** anon client carrying this user's session — runs every query under their RLS. */
  supabase: SupabaseClient;
  userId: string;
}

async function signIn(email: string, password: string, who: string): Promise<SignedInUser> {
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error(
      "E2E Supabase env missing — set E2E_SUPABASE_URL / E2E_SUPABASE_ANON_KEY (or VITE_*). See e2e/README.md.",
    );
  }
  // persistSession:false → each call is an isolated client; no shared/leaked auth
  // state between specs or between the test user and the viewer.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    throw new Error(`E2E ${who} sign-in failed: ${error?.message || "no session returned"}`);
  }
  return { supabase, userId: data.user.id };
}

/** Sign in as the pm+ test account (E2E_USER / E2E_PASS). Throws if unset. */
export async function signInAsTestUser(): Promise<SignedInUser> {
  const email = process.env.E2E_USER || "";
  const password = process.env.E2E_PASS || "";
  if (!email || !password) {
    throw new Error("Set E2E_USER / E2E_PASS to run authenticated E2E specs. See e2e/README.md.");
  }
  return signIn(email, password, "test user");
}

/**
 * Sign in as a viewer-role account (E2E_VIEWER_USER / E2E_VIEWER_PASS). Returns
 * null when those are unset so RLS-deny specs can `test.skip` rather than fail —
 * a wrong password (creds set but rejected) still throws.
 */
export async function signInAsViewerOrNull(): Promise<SignedInUser | null> {
  const email = process.env.E2E_VIEWER_USER || "";
  const password = process.env.E2E_VIEWER_PASS || "";
  if (!email || !password) return null;
  return signIn(email, password, "viewer");
}
