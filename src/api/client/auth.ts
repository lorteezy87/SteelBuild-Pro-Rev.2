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

const BLOCKED_FIELDS = new Set([
  'role', 'roles', 'is_admin', 'isAdmin', 'admin', 'permissions', 'perms',
  'id', 'user_id', 'uid', 'sub', 'email', 'email_verified', 'phone_verified',
  'aud', 'exp', 'iat', 'iss', 'app_metadata',
]);

/**
 * Server-authoritative role for a user — always from `user_profiles.role`,
 * never the client-writable user_metadata.
 *
 * Two different "no role" cases, deliberately resolved differently:
 *
 *   • READ SUCCEEDED, role absent/blank → 'user'. This is the normal state for
 *     an account with no elevated global role, and permissions.ts ranks it at
 *     PM level, which is the intended default.
 *
 *   • READ FAILED (error or throw) → 'viewer', the LEAST privileged rank.
 *     This previously also returned 'user', so a transient user_profiles read
 *     failure silently handed a genuine viewer a PM-enabled UI. RLS still
 *     blocked the writes, so it was never a breach — but the user got a screen
 *     full of controls that fail on click, which is its own kind of broken.
 *     An unknown role must degrade downward, not upward.
 */
const ROLE_ON_READ_FAILURE = 'viewer';

async function fetchProfileRole(userId: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) return ROLE_ON_READ_FAILURE;
    const r = (data as { role?: unknown } | null)?.role;
    return (typeof r === 'string' && r.trim()) || 'user';
  } catch {
    return ROLE_ON_READ_FAILURE;
  }
}

function resolveFullName(
  meta: Record<string, unknown>,
  email: string | undefined | null,
): string {
  return (
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    email ||
    ''
  );
}

async function buildAuthMeResult(user: {
  id: string;
  email?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): Promise<AuthMeResult> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role = await fetchProfileRole(user.id);
  return {
    ...stripPrivilegeMeta(meta),
    id: user.id,
    email: user.email ?? undefined,
    full_name: resolveFullName(meta, user.email),
    created_date: user.created_at ?? undefined,
    role,
  };
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
    return buildAuthMeResult(user);
  },

  /**
   * Sign in with email and password.
   */
  loginViaEmailPassword: async (email: string, password: string) => {
    if (typeof email !== 'string' || !email.trim()) {
      const e = new Error('Email is required') as Error & { status?: number };
      e.status = 400;
      throw e;
    }
    if (typeof password !== 'string' || !password) {
      const e = new Error('Password is required') as Error & { status?: number };
      e.status = 400;
      throw e;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
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
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Redirect to the login surface.
   * There is no `/login` route — when unauthenticated, the Landing page (`/`)
   * IS the login surface (AuthenticatedApp renders the sign-in form there), so
   * navigate to `/` rather than a nonexistent `/login` (which would 404 / fall
   * through to the catch-all).
   */
  redirectToLogin: (url?: string): void => {
    if (typeof window === 'undefined') return;
    const params = url ? `?redirect=${encodeURIComponent(url)}` : '';
    window.location.href = `/${params}`;
  },

  /**
   * Update the current user's metadata.
   */
  updateMe: async (updates: Record<string, unknown>): Promise<AuthMeResult> => {
    // DENY only identity / privilege-bearing keys; allow preference keys through.
    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (!BLOCKED_FIELDS.has(key)) safeUpdates[key] = value;
    }
    const { data, error } = await supabase.auth.updateUser({ data: safeUpdates });
    if (error) throw error;
    if (!data.user) throw new Error('Not authenticated');
    return buildAuthMeResult(data.user);
  },
};
