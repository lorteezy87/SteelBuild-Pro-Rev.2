/**
 * authMeta — guards against client-controlled privilege claims.
 *
 * Supabase `user_metadata` is CLIENT-WRITABLE: any signed-in user can call
 * `supabase.auth.updateUser({ data: { role: 'admin' } })` directly from the
 * browser. So user_metadata must never be trusted as a source of authorization,
 * and must never be spread into an app user object in a way that could override
 * the server-authoritative `role` (which always comes from `user_profiles.role`).
 *
 * The real data boundary is RLS (which reads `user_profiles.role`, never
 * user_metadata), but the client admin gates (AdminRoute, useAppSecurity.isAdmin)
 * key off the mapped user's `role`, so a metadata-injected role would still
 * expose admin-only UI / client-side actions. Strip these keys before spreading
 * metadata, and set `role` LAST from the profile.
 */

/** Keys a client must never be able to assert on itself via user_metadata. */
export const PRIVILEGE_META_KEYS = [
  'role', 'roles', 'is_admin', 'isAdmin', 'admin', 'permissions', 'perms',
] as const;

const BLOCKED = new Set<string>(PRIVILEGE_META_KEYS);

/** Copy of `meta` with every privilege-bearing key removed. */
export function stripPrivilegeMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (!BLOCKED.has(key)) safe[key] = value;
  }
  return safe;
}
