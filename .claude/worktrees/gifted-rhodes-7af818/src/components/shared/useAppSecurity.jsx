/**
 * useAppSecurity.jsx
 * Central security hook for SteelBuild Pro.
 *
 * RBAC Phase B (079/080):
 *   - Per-project role is now server-authoritative via `get_my_project_role(uuid)`.
 *     When an `activeProject` is set, the DB role wins.
 *   - Global admin override: `user_profiles.role === 'admin'` (read from AuthContext)
 *     always grants admin powers regardless of per-project role.
 *   - LocalStorage role (key: 'sbp_app_roles') remains as a fallback for screens
 *     that have no active project (settings, login, portfolio chrome).
 *   - 'owner' is treated as a synonym for 'admin' (level 3) — matches the SQL
 *     `user_has_project_role_at_least` helper. All 15 existing user_projects
 *     rows are 'owner' and continue to behave as admin.
 *
 * Roles stored in localStorage key: 'sbp_app_roles'
 * Format: { [email]: 'owner' | 'admin' | 'pm' | 'field' | 'viewer' }
 */

import { useMemo, useCallback, useContext } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import { ProjectContext } from './ProjectContext';
import { useProjectRole, roleAtLeast } from '@/hooks/useProjectRole';

// ─── Seed admin emails here ───────────────────────────────────────
// These bypass localStorage — cannot be demoted by other admins.
// Note: the canonical global admin signal is `user_profiles.role === 'admin'`
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

// ─── localStorage helpers ─────────────────────────────────────────
function getRolesMap() {
  try {
    const raw = localStorage.getItem('sbp_app_roles');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRolesMap(map) {
  try {
    localStorage.setItem('sbp_app_roles', JSON.stringify(map));
  } catch {
    console.warn('[Security] Could not persist role map');
  }
}

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
  // Priority: global system admin > per-project DB role > localStorage > default 'pm'
  const role = useMemo(() => {
    if (!user?.email) return 'viewer';

    // Global system admin (server-authoritative)
    if (authCtx?.user?.role === 'admin') return 'admin';

    // Static seed list (rare; usually empty)
    if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return 'admin';

    // Per-project role from the DB beats localStorage when available
    if (dbProjectRole) return dbProjectRole;

    // Fallback: legacy localStorage map (no active project, hook still loading, etc.)
    const map = getRolesMap();
    return map[user.email.toLowerCase()] || 'pm';
  }, [user, authCtx?.user?.role, dbProjectRole]);

  const roleLevel = ROLE_LEVELS[role] ?? 1;

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

  // ── Role management (admin only) ─────────────────────────────
  // NOTE: this still mutates localStorage. Phase C will add a real
  // per-project role-management admin UI backed by the user_projects table.
  const setUserRole = useCallback((email, newRole) => {
    if (!roleAtLeast(role, 'admin')) {
      console.warn('[Security] setUserRole blocked — requires admin');
      return false;
    }
    if (!Object.prototype.hasOwnProperty.call(ROLE_LEVELS, newRole)) {
      console.warn('[Security] Invalid role:', newRole);
      return false;
    }
    const map = getRolesMap();
    map[email.toLowerCase()] = newRole;
    saveRolesMap(map);
    return true;
  }, [role]);

  const getUserRole = useCallback((email) => {
    if (!email) return 'viewer';
    if (ADMIN_EMAILS.includes(email.toLowerCase())) return 'admin';
    const map = getRolesMap();
    return map[email.toLowerCase()] || 'pm';
  }, []);

  const listRoles = useCallback(() => getRolesMap(), []);

  const removeUserRole = useCallback((email) => {
    if (!roleAtLeast(role, 'admin')) return false;
    const map = getRolesMap();
    delete map[email.toLowerCase()];
    saveRolesMap(map);
    return true;
  }, [role]);

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
    setUserRole,
    getUserRole,
    removeUserRole,
    listRoles,
  };
}
