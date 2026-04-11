/**
 * useAppSecurity.jsx
 * Central security hook for SteelBuild Pro.
 *
 * Roles stored in localStorage key: 'sbp_app_roles'
 * Format: { [email]: 'admin' | 'pm' | 'field' | 'viewer' }
 *
 * Default role for any authenticated user: 'pm'
 * Admin seed: add emails to ADMIN_EMAILS below — always admin regardless of stored roles
 */

import { useMemo, useCallback, useContext } from 'react';
import { AuthContext } from './AuthContext';

// ─── Seed admin emails here ───────────────────────────────────────
// These bypass localStorage — cannot be demoted by other admins
const ADMIN_EMAILS = [
  // 'nick@yourcompany.com',
];

// ─── Role hierarchy (higher index = more access) ──────────────────
const ROLE_LEVELS = {
  viewer: 0,
  field:  1,
  pm:     2,
  admin:  3,
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

  // Resolve role for current user
  const role = useMemo(() => {
    if (!user?.email) return 'viewer';
    if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return 'admin';
    const map = getRolesMap();
    return map[user.email.toLowerCase()] || 'pm'; // default: pm
  }, [user]);

  const roleLevel = ROLE_LEVELS[role] ?? 1;

  // ── Permission check ──────────────────────────────────────────
  // Minimum role levels: delete/admin require admin, create/edit require field+
  const ACTION_MIN_LEVEL = { view: 0, create: 1, edit: 1, delete: 3, admin: 3 };

  const can = useCallback((action, record = null) => {
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
  const assertProjectId = useCallback((data, activeProjectId) => {
    if (!activeProjectId) return data;
    if (data.project_id && data.project_id !== activeProjectId) {
      console.warn(
        '[Security] project_id mismatch on write — forcing to active project',
        { provided: data.project_id, active: activeProjectId }
      );
    }
    return { ...data, project_id: activeProjectId };
  }, []);

  // ── Role management (admin only) ─────────────────────────────
  const setUserRole = useCallback((email, newRole) => {
    if (role !== 'admin') {
      console.warn('[Security] setUserRole blocked — requires admin');
      return false;
    }
    if (!ROLE_LEVELS.hasOwnProperty(newRole)) {
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
    if (role !== 'admin') return false;
    const map = getRolesMap();
    delete map[email.toLowerCase()];
    saveRolesMap(map);
    return true;
  }, [role]);

  return {
    user,
    role,
    roleLevel,
    isAdmin:  role === 'admin',
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