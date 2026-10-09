import { useContext, useRef, useState, type SetStateAction } from 'react';
import { AuthContext } from '@/lib/AuthContext';
import { useOptionalOrg } from '@/components/shared/OrgContext';
import { useOperationOwner } from './useOperationOwner';

type CalculatorOrganizationScope = { currentOrg: { id: string } | null; isLoadingOrgs: boolean };

/** Legacy keys have no reliable owner. Leave their bytes untouched and unassigned. */
export function useOwnedCalculatorState<T>(namespace: string, fallback: T): [T, (value: SetStateAction<T>) => void] {
  const auth = useContext(AuthContext);
  // The legacy JSX context initializes with undefined; describe the narrow
  // published contract here instead of inheriting that initializer's type.
  const org = useOptionalOrg() as CalculatorOrganizationScope | undefined;
  const key = auth?.user?.id && org?.currentOrg?.id && !org.isLoadingOrgs
    ? `sbp:calculator:v2:${JSON.stringify([auth.user.id, org.currentOrg.id, namespace])}` : null;
  const capture = useOperationOwner(key);
  const state = useRef<{ key: string | null; value: T } | null>(null);
  const [, refresh] = useState(0);
  if (!state.current || state.current.key !== key) {
    let value = fallback;
    try {
      const raw = key ? localStorage.getItem(key) : null;
      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);
        if (Array.isArray(fallback) ? Array.isArray(stored) : typeof stored === typeof fallback) value = stored as T;
      }
    } catch { /* Corrupt or unavailable browser storage leaves an empty local tool. */ }
    state.current = { key, value };
  }
  const origin = state.current;
  const owner = capture();
  return [origin.value, value => {
    if (!owner.isCurrent() || state.current !== origin) return;
    origin.value = typeof value === 'function' ? (value as (prior: T) => T)(origin.value) : value;
    try { if (key) localStorage.setItem(key, JSON.stringify(origin.value)); } catch { /* Device quota. */ }
    refresh(count => count + 1);
  }];
}
