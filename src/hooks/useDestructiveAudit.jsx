import { useCallback, useContext } from "react";
import { AuthContext } from "@/lib/AuthContext";

const STORAGE_KEY = "sbp_audit_log";
const MAX_ENTRIES = 200;

export function useDestructiveAudit() {
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;

  const logAction = useCallback(
    (action, details = {}) => {
      if (typeof window === "undefined") return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const log = raw ? JSON.parse(raw) : [];

        const entry = {
          ts: new Date().toISOString(),
          userEmail: user?.email || "unknown",
          userId: user?.id || null,
          action,
          url:
            typeof window !== "undefined" ? window.location.pathname : null,
          ...details,
        };

        const trimmed = [entry, ...log].slice(0, MAX_ENTRIES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // Never let logging break the app.
      }
    },
    [user]
  );

  const getLog = useCallback((filterAction = null) => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const log = raw ? JSON.parse(raw) : [];
      return filterAction ? log.filter((e) => e.action === filterAction) : log;
    } catch {
      return [];
    }
  }, []);

  const clearLog = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { logAction, getLog, clearLog };
}
