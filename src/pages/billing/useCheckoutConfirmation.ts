import { useEffect, useState, useSyncExternalStore } from 'react';
import { getActiveOrgGeneration, getActiveOrgId, subscribeActiveOrgChange } from '@/lib/activeOrg';
import { getCheckoutStatus } from '@/lib/billing/billingService';

type ConfirmationState = 'idle' | 'checking' | 'pending' | 'confirmed' | 'expired' | 'error' | 'wrong_workspace';
interface Options {
  orgId: string | null | undefined;
  canManage: boolean;
  native: boolean;
  refetchOrgs: () => unknown;
}

export function useCheckoutConfirmation({ orgId, canManage, native, refetchOrgs }: Options) {
  const generation = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, getActiveOrgGeneration);
  const [request] = useState(() => {
    const url = new URL(window.location.href);
    return { session: url.searchParams.get('session_id'), org: url.searchParams.get('checkout_org'), generation };
  });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ConfirmationState>('idle');
  const sameVisit = generation === request.generation && getActiveOrgId() === orgId;

  useEffect(() => {
    if (!request.session || native || !canManage || !orgId || !sameVisit) return;
    if (request.org !== orgId) { setState('wrong_workspace'); return; }
    let canceled = false;
    let next: ReturnType<typeof setTimeout> | undefined;
    const current = () => !canceled && getActiveOrgGeneration() === request.generation && getActiveOrgId() === orgId;
    const clearReturnQuery = () => {
      const url = new URL(window.location.href);
      if (url.searchParams.get('session_id') !== request.session || url.searchParams.get('checkout_org') !== orgId) return;
      for (const key of ['status', 'session_id', 'checkout_org']) url.searchParams.delete(key);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    };
    setState('checking');
    // Also bounds a provider request or workspace refresh that never settles.
    const deadline = setTimeout(() => {
      if (current()) { setState('pending'); canceled = true; clearTimeout(next); }
    }, 30_000);
    const poll = async () => {
      try {
        const result = await getCheckoutStatus(orgId, request.session!);
        if (!current()) return;
        if (result.state === 'confirmed') {
          const refreshed = await refetchOrgs();
          if (!current()) return;
          // TanStack refetch normally resolves an error result rather than rejecting.
          if (refreshed && typeof refreshed === 'object' && 'isError' in refreshed && refreshed.isError === true) {
            setState('error'); clearTimeout(deadline); return;
          }
          setState('confirmed'); clearReturnQuery(); clearTimeout(deadline);
        } else if (result.state === 'expired') {
          setState('expired'); clearReturnQuery(); clearTimeout(deadline);
        } else {
          next = setTimeout(() => { void poll(); }, 2000);
        }
      } catch {
        if (current()) { setState('error'); clearTimeout(deadline); }
      }
    };
    void poll();
    return () => { canceled = true; clearTimeout(next); clearTimeout(deadline); };
  }, [orgId, canManage, native, sameVisit, request, attempt, refetchOrgs]);

  return { state: (sameVisit && !native && canManage ? state : 'idle') as ConfirmationState,
    retry: () => setAttempt(value => value + 1) };
}
