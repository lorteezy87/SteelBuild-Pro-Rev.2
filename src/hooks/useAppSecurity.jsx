import { useMemo, useCallback, useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";

const ADMIN_EMAILS = [
  // 'nick@yourcompany.com',
];

const ROLE_LEVELS = {
  viewer: 0,
  field: 1,
  pm: 2,
  admin: 3,
};

function getRolesMap() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("sbp_app_roles");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRolesMap(map) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("sbp_app_roles", JSON.stringify(map));
  } catch {
    console.warn("[Security] Could not persist role map");
  }
}

export function useAppSecurity() {
  const authCtx = useContext(AuthContext);

  let user;
  let isAuthenticated;

  if (authCtx) {
    user = authCtx.user;
    isAuthenticated = authCtx.isAuthenticated;
  } else {
    user = {
      email:
        typeof window !== "undefined"
          ? window.localStorage.getItem("current_user_email")
          : null,
      id:
        typeof window !== "undefined"
          ? window.localStorage.getItem("current_user_id")
          : null,
    };
    isAuthenticated = !!user.email;
  }

  const role = useMemo(() => {
    if (!user?.email) return "viewer";
    if (ADMIN_EMAILS.includes(user.email.toLowerCase())) return "admin";
    const map = getRolesMap();
    return map[user.email.toLowerCase()] || "pm";
  }, [user]);

  const roleLevel = ROLE_LEVELS[role] ?? 1;

  const can = useCallback(
    (_action, _record = null) => {
      if (!isAuthenticated) return false;
      return true;
    },
    [isAuthenticated]
  );

  const stamp = useCallback(
    (data) => ({
      ...data,
      created_by: data.created_by || user?.email || "unknown",
      created_uid: data.created_uid || user?.id || null,
    }),
    [user]
  );

  const assertProjectId = useCallback((data, activeProjectId) => {
    if (!activeProjectId) return data;
    if (data.project_id && data.project_id !== activeProjectId) {
      console.warn("[Security] project_id mismatch on write", {
        provided: data.project_id,
        active: activeProjectId,
      });
    }
    return { ...data, project_id: activeProjectId };
  }, []);

  const setUserRole = useCallback(
    (email, newRole) => {
      if (role !== "admin") {
        console.warn("[Security] setUserRole blocked — requires admin");
        return false;
      }
      if (!Object.prototype.hasOwnProperty.call(ROLE_LEVELS, newRole)) {
        console.warn("[Security] Invalid role:", newRole);
        return false;
      }
      const map = getRolesMap();
      map[email.toLowerCase()] = newRole;
      saveRolesMap(map);
      return true;
    },
    [role]
  );

  const getUserRole = useCallback((email) => {
    if (!email) return "viewer";
    if (ADMIN_EMAILS.includes(email.toLowerCase())) return "admin";
    const map = getRolesMap();
    return map[email.toLowerCase()] || "pm";
  }, []);

  const listRoles = useCallback(() => getRolesMap(), []);

  const removeUserRole = useCallback(
    (email) => {
      if (role !== "admin") return false;
      const map = getRolesMap();
      delete map[email.toLowerCase()];
      saveRolesMap(map);
      return true;
    },
    [role]
  );

  return {
    user,
    role,
    roleLevel,
    isAdmin: role === "admin",
    isPM: roleLevel >= ROLE_LEVELS.pm,
    isField: role === "field",
    isViewer: role === "viewer",
    can,
    stamp,
    assertProjectId,
    setUserRole,
    getUserRole,
    removeUserRole,
    listRoles,
  };
}
