/**
 * useDestructiveAudit.jsx
 * Lightweight forensic log for destructive operations.
 *
 * Writes to localStorage. Survives page refresh.
 * Rolling max: 200 entries (oldest trimmed automatically).
 *
 * Admin can inspect via browser console:
 *   JSON.parse(localStorage.getItem('sbp_audit_log'))
 *
 * Or filter by action:
 *   JSON.parse(localStorage.getItem('sbp_audit_log'))
 *     .filter(e => e.action === 'delete_project')
 */

import { useCallback, useContext } from 'react';
import { AuthContext } from './AuthContext';

const STORAGE_KEY = 'sbp_audit_log';
const MAX_ENTRIES = 200;

export function useDestructiveAudit() {
  // Use useContext directly to avoid throwing error when AuthProvider not available
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;

  const logAction = useCallback((action, details = {}) => {
    try {
      const raw   = localStorage.getItem(STORAGE_KEY);
      const log   = raw ? JSON.parse(raw) : [];

      const entry = {
        ts:        new Date().toISOString(),
        userEmail: user?.email || 'unknown',
        userId:    user?.id    || null,
        action,
        url:       typeof window !== 'undefined'
                     ? window.location.pathname
                     : null,
        ...details,
      };

      // Prepend and trim to rolling max
      const trimmed = [entry, ...log].slice(0, MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Never let logging break the app
    }
  }, [user]);

  const getLog = useCallback((filterAction = null) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const log  = raw ? JSON.parse(raw) : [];
      return filterAction
        ? log.filter(e => e.action === filterAction)
        : log;
    } catch {
      return [];
    }
  }, []);

  const clearLog = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { logAction, getLog, clearLog };
}