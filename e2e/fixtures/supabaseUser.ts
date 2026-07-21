import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveE2EEnvironment } from "../environment";

/**
 * e2e/fixtures/supabaseUser.ts
 *
 * Returns a Supabase client authenticated as a real test user — the same
 * sign-in path global-setup uses, but exposed as a node-level client so a spec
 * can drive the actual client → PostgREST → RLS → trigger boundary (not the
 * browser). This is what lets the fab-release gate spec assert SERVER
 * arbitration, which the Vitest suite structurally can't (it mocks supabase).
 *
 * Env (reuses the existing E2E vars; see e2e/README.md):
 *   E2E_SUPABASE_URL | VITE_SUPABASE_URL
 *   E2E_SUPABASE_ANON_KEY | VITE_SUPABASE_ANON_KEY
 *   E2E_USER / E2E_PASS                    primary test account (pm+ in the fixture project)
 *   E2E_VIEWER_USER / E2E_VIEWER_PASS      OPTIONAL viewer-role account for the RLS-deny test
 */
export interface SignedInClient {
  supabase: SupabaseClient;
  userId: string;
}

async function signIn(email: string, password: string): Promise<SignedInClient> {
  const environment = resolveE2EEnvironment({ ...process.env, E2E_USER: email, E2E_PASS: password });
  const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`E2E sign-in failed for ${email}: ${error?.message || "no session"}`);
  }
  return { supabase, userId: data.user!.id };
}

/** Primary pm+ test user. Throws if E2E_USER/E2E_PASS are unset. */
export function signInAsTestUser(): Promise<SignedInClient> {
  const email = process.env.E2E_USER || "";
  const password = process.env.E2E_PASS || "";
  if (!email || !password) {
    throw new Error("E2E_USER / E2E_PASS not set. See e2e/README.md.");
  }
  return signIn(email, password);
}

/** Optional viewer-role user for the RLS-deny assertion. Returns null if not configured. */
export async function signInAsViewerOrNull(): Promise<SignedInClient | null> {
  const email = process.env.E2E_VIEWER_USER || "";
  const password = process.env.E2E_VIEWER_PASS || "";
  if (!email || !password) return null;
  return signIn(email, password);
}
