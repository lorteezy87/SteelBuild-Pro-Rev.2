/**
 * useAppSecurity.jsx
 * Central security hook for SteelBuild Pro.
 *
 * RBAC (Phase C):
 *   - Per-project role is server-authoritative via `get_my_project_role(uuid)`.
 *     When an `activeProject` is set, the DB role is the source of truth.
 *   - Global admin override: `user_profiles.role === 'admin'` (read from AuthContext)
 *     always grants admin powers regardless of per-project role.
 *   - No active project / role still loading → default to the least-privilege
 *     role ('viewer'). The browser is never trusted to assert a role: the old
 *     attacker-editable `localStorage` role map ('sbp_app_roles') has been
 *     removed as a permission source. RLS at the DB boundary remains the real
 *     enforcement; these client checks only shape the UI.
 *   - 'owner' is treated as a synonym for 'admin' (level 3) — matches the SQL
 *     `user_has_project_role_at_least` helper.
 */

import { useMemo, useCallback, useContext } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import { ProjectContext } from './ProjectContext';
import { useProjectRole, roleAtLeast } from '@/hooks/useProjectRole';

// ─── Seed admin emails here ───────────────────────────────────────
// Code-controlled break-glass list (not user-editable at runtime).
// The canonical global admin signal is `user_profiles.role === 'admin'`
// (AuthContext.user.role); this list is a static fallback only.
const ADMIN_EMAILS = [
  // 'nick@yourcompany.com',
];

// ─── Role hierarchy (higher index = more access) ──────────────────
// 'owner' is a synonym for 'admin' (matches SQL helper).
const ROLE_LEVELS = {
  viewer: 0,
  field:  1,
  pm:     2,
  admin:  3,
  owner:  3,
};

// ─────────────────────────────────────────────────────────────────
export function useAppSecurity() {
  // Use useContext directly to avoid throwing error
  const authCtx = useContext(AuthContext);
  const projectCtx = useContext(ProjectContext);

  let user, isAuthenticated;

  if (authCtx) {
    user = authCtx.user;
    isAuthenticated = authCtx.isAuthenticated;
  } else {
    // AuthProvider not available — use localStorage fallback
    user = {
      email: typeof window !== 'undefined' ? localStorage.getItem('current_user_email') : null,
      id: typeof window !== 'undefined' ? localStorage.getItem('current_user_id') : null,
    };
    isAuthenticated = !!user.email;
  }

  // Per-project role from the DB — null while loading or when there's no
  // active project. The hook safely no-ops when projectId is falsy.
  const activeProjectId = projectCtx?.activeProject?.id || null;
  const { role: dbProjectRole } = useProjectRole(activeProjectId);

  // ── Resolve role for current user ─────────────────────────────
  // Priority: global system admin > per-project DB role > least-privilege default.
  // The client never asserts a role on its own; with no DB role resolved we
  // fall back to 'viewer' so the UI stays locked down until the server says
  // otherwise. RLS is the real boundary.
  const role = useMemo(() => {
    if (!user?.email) return 'viewer';

    // Global system admin (server-authoritative)
    if (authCtx?.user?.role === 'admin') return 'admin';

    // Static seed list (code-controlled, not user-editable; usually empty)
    if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return 'admin';

    // Per-project role from the DB
    if (dbProjectRole) return dbProjectRole;

    // No active project or role still loading → least privilege
    return 'viewer';
  }, [user, authCtx?.user?.role, dbProjectRole]);

  const roleLevel = ROLE_LEVELS[role] ?? 0;

  // ── Permission check ──────────────────────────────────────────
  // Minimum role levels: delete/admin require admin, create/edit require field+
  const ACTION_MIN_LEVEL = { view: 0, create: 1, edit: 1, delete: 3, admin: 3 };

  const can = useCallback((action /* , record = null */) => {
    if (!isAuthenticated) return false;
    const minLevel = ACTION_MIN_LEVEL[action] ?? 1;
    return roleLevel >= minLevel;
  }, [isAuthenticated, roleLevel]);

  // ── Stamp created_by on new records ──────────────────────────
  const stamp = useCallback((data) => {
    return {
      ...data,
      created_by:  data.created_by  || user?.email || 'unknown',
      created_uid: data.created_uid || user?.id    || null,
    };
  }, [user]);

  // ── Enforce project_id on writes ─────────────────────────────
  // Prevents cross-project data injection
  const assertProjectId = useCallback((data, activeProjectIdArg) => {
    if (!activeProjectIdArg) return data;
    if (data.project_id && data.project_id !== activeProjectIdArg) {
      console.warn(
        '[Security] project_id mismatch on write — forcing to active project',
        { provided: data.project_id, active: activeProjectIdArg }
      );
    }
    return { ...data, project_id: activeProjectIdArg };
  }, []);

  // isAdmin combines the global override and per-project rank.
  // Global admin (user_profiles.role === 'admin') wins; otherwise we
  // require role >= admin on the active project (owner counts as admin).
  const isAdmin = useMemo(() => (
    authCtx?.user?.role === 'admin'
    || roleAtLeast(role, 'admin')
  ), [authCtx?.user?.role, role]);

  return {
    user,
    role,
    roleLevel,
    isAdmin,
    isPM:     roleLevel >= ROLE_LEVELS.pm,
    isField:  role === 'field',
    isViewer: role === 'viewer',
    can,
    stamp,
    assertProjectId,
  };
}
