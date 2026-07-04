/**
 * auth.ts
 *
 * Authentication surface: me() / loginViaEmailPassword / logout /
 * redirectToLogin / updateMe, plus the server-authoritative role lookup and the
 * privilege-escalation guards (stripPrivilegeMeta / BLOCKED_FIELDS). Extracted
 * verbatim from supabaseClient.ts.
 */

import { supabase } from '@/lib/supabase';
import { stripPrivilegeMeta } from '@/lib/authMeta';
import type { AuthMeResult } from './supabaseTypes';

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Server-authoritative role for a user — always from `user_profiles.role`,
 * never the client-writable user_metadata. Falls back to 'user' on any error.
 */
async function fetchProfileRole(userId: string): Promise<string> {
  try {
    const { data } = await supabase.from('user_profiles').select('role').eq('id', userId).maybeSingle();
    const r = (data as { role?: unknown } | null)?.role;
    return (typeof r === 'string' && r) || 'user';
  } catch {
    return 'user';
  }
}

export const auth = {
  /**
   * Get the currently authenticated user.
   * Returns a user object compatible with what the legacy backend returned.
   */
  me: async (): Promise<AuthMeResult> => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Not authenticated');
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      user.email ||
      '';
    // role from user_profiles (server-authoritative), NOT client-writable meta;
    // strip privilege keys and set the authoritative fields last.
    const role = await fetchProfileRole(user.id);
    return {
      ...stripPrivilegeMeta(meta),
      id: user.id,
      email: user.email,
      full_name: fullName,
      role,
    };
  },

  /**
   * Sign in with email and password.
   */
  loginViaEmailPassword: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const e = new Error(error.message) as Error & { status?: number };
      e.status = error.status;
      throw e;
    }
    return data;
  },

  /**
   * Sign out the current user.
   */
  logout: async (): Promise<void> => {
    await supabase.auth.signOut();
  },

  /**
   * Redirect to the login surface.
   * There is no `/login` route — when unauthenticated, the Landing page (`/`)
   * IS the login surface (AuthenticatedApp renders the sign-in form there), so
   * navigate to `/` rather than a nonexistent `/login` (which would 404 / fall
   * through to the catch-all).
   */
  redirectToLogin: (url?: string): void => {
    const redirect = url ? `?redirect=${encodeURIComponent(url)}` : '';
    window.location.href = `/${redirect}`;
  },

  /**
   * Update the current user's metadata.
   */
  updateMe: async (updates: Record<string, unknown>): Promise<AuthMeResult> => {
    // The Settings tabs persist their preferences as flat keys on
    // user_metadata (and `auth.me()` reads them back the same way), so we
    // can't use a fixed allow-list — that silently dropped every preference
    // and settings never saved. Instead DENY only the identity / privilege-
    // bearing keys (so a user can't escalate by writing role:"admin", etc.)
    // and allow all other (preference) keys through. Note: client admin gates
    // read meta.role only cosmetically — real authorization is server-side via
    // user_profiles.role + RLS (user_is_system_admin), which never trusts
    // user_metadata — so this is the correct boundary.
    const BLOCKED_FIELDS = new Set([
      'role', 'roles', 'is_admin', 'isAdmin', 'admin', 'permissions', 'perms',
      'id', 'user_id', 'uid', 'sub', 'email', 'email_verified', 'phone_verified',
      'aud', 'exp', 'iat', 'iss', 'app_metadata',
    ]);
    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!BLOCKED_FIELDS.has(key)) safeUpdates[key] = value;
    }
    const { data, error } = await supabase.auth.updateUser({ data: safeUpdates });
    if (error) throw error;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      data.user.email ||
      '';
    // role from user_profiles (server-authoritative), never the returned meta;
    // strip privilege keys and set the authoritative fields last.
    const role = await fetchProfileRole(data.user.id);
    return {
      ...stripPrivilegeMeta(meta),
      id: data.user.id,
      email: data.user.email,
      full_name: fullName,
      role,
    };
  },
};
