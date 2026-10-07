/**
 * Local destructive-action history, isolated by authenticated user/workspace.
 * Legacy entries are read only after matching their recorded userId; the
 * legacy store is never migrated, reassigned, cleared, or rewritten.
 */
import { useCallback, useContext, useRef } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import { useOptionalOrg } from '@/components/shared/OrgContext';
import {
  appendOwnedAudit, clearOwnedAudit, localDataKey, readOwnedAudit,
} from '@/lib/localDataOwnership';

export function useDestructiveAudit() {
  const auth = useContext(AuthContext);
  const org = useOptionalOrg();
  const user = auth?.isAuthenticated ? auth.user : null;
  const userId = user?.id;
  const orgId = org?.currentOrg?.id;
  const owner = userId && orgId ? { userId, orgId } : null;
  const storageKey = localDataKey('audit', owner);
  const currentKey = useRef(storageKey);
  currentKey.current = storageKey;

  const logAction = useCallback((action, details = {}) => {
    if (!userId || !orgId || currentKey.current !== storageKey) return;
    try {
      appendOwnedAudit(localStorage, { userId, orgId }, action, details, user?.email,
        typeof window !== 'undefined' ? window.location.pathname : null);
    } catch { /* Logging must never break the operation. */ }
  }, [userId, orgId, storageKey, user?.email]);

  const getLog = useCallback((filterAction = null) => {
    if (!userId || !orgId || currentKey.current !== storageKey) return [];
    try {
      return readOwnedAudit(localStorage, { userId, orgId }, filterAction);
    } catch { return []; }
  }, [userId, orgId, storageKey]);

  const clearLog = useCallback(() => {
    if (!userId || !orgId || currentKey.current !== storageKey) return;
    try {
      clearOwnedAudit(localStorage, { userId, orgId });
    } catch { /* storage unavailable */ }
  }, [userId, orgId, storageKey]);

  return { logAction, getLog, clearLog };
}
