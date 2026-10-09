import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { getActiveOrgGeneration, getActiveOrgId, subscribeActiveOrgChange } from '@/lib/activeOrg';
import { openBillingPortal, startCheckout } from '@/lib/billing/billingService';

interface BillingActionOptions {
  orgId: string | null | undefined;
  canManage: boolean;
  native: boolean;
  refetchOrgs: () => unknown;
  navigate?: (url: string) => void;
}
interface ActionScope {
  orgId: string | null;
  generation: number;
  canManage: boolean;
  native: boolean;
  pending: object | null;
}
const navigateToBilling = (url: string) => { window.location.assign(url); };

/** A reply belongs to one workspace visit, including when A is reopened after B. */
export function useBillingActions({ orgId, canManage, native, refetchOrgs, navigate = navigateToBilling }: BillingActionOptions) {
  const generation = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, getActiveOrgGeneration);
  const scopeRef = useRef<ActionScope | null>(null);
  const mounted = useRef(false);
  const lifetime = useRef(0);
  const [busyState, setBusy] = useState<{ scope: ActionScope; action: string } | null>(null);
  if (!scopeRef.current || scopeRef.current.orgId !== (orgId || null) || scopeRef.current.generation !== generation ||
      scopeRef.current.canManage !== canManage || scopeRef.current.native !== native) {
    scopeRef.current = { orgId: orgId || null, generation, canManage, native, pending: null };
  }
  const scope = scopeRef.current;
  const busy = busyState?.scope === scope ? busyState.action : null;
  useLayoutEffect(() => {
    mounted.current = true;
    lifetime.current++;
    return () => { mounted.current = false; lifetime.current++; };
  }, []);

  // The return query is only a navigation hint. Entitlements and the visible
  // plan continue to come from the webhook-backed organization row.
  useEffect(() => {
    if (!orgId || native || getActiveOrgId() !== orgId) return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get('status');
    if (status !== 'success' && status !== 'cancel') return;
    url.searchParams.delete('status');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    if (status === 'cancel') {
      toast.message('Checkout closed. Your current plan is shown below.');
      return;
    }
    toast.message('Checkout returned. Payment confirmation may still be pending; your current workspace plan is shown below.');
    const visit = lifetime.current;
    let canceled = false;
    const refresh = async () => {
      if (canceled || !mounted.current || lifetime.current !== visit || scopeRef.current !== scope ||
          getActiveOrgGeneration() !== generation || getActiveOrgId() !== orgId) return;
      // TanStack refetch can reject when callers enable throwOnError. No payment
      // claim is made on either success or failure; the current plan is authoritative.
      try { await refetchOrgs(); } catch { /* Existing plan stays visible. */ }
    };
    void refresh();
    const timer = setTimeout(() => { void refresh(); }, 1500);
    return () => { canceled = true; clearTimeout(timer); };
  }, [orgId, native, generation, refetchOrgs, scope]);

  const run = async (action: string) => {
    if (!scope.orgId || !scope.canManage || scope.native || scope.pending || !mounted.current ||
        scopeRef.current !== scope || getActiveOrgId() !== scope.orgId || getActiveOrgGeneration() !== scope.generation) return;
    const operation = {};
    const visit = lifetime.current;
    scope.pending = operation; // Lock synchronously, before React commits disabled buttons.
    setBusy({ scope, action });
    const isCurrent = () => mounted.current && lifetime.current === visit && scopeRef.current === scope &&
      scope.pending === operation && getActiveOrgId() === scope.orgId && getActiveOrgGeneration() === scope.generation;
    try {
      const url = action === 'portal' ? await openBillingPortal(scope.orgId) : await startCheckout(action, scope.orgId);
      if (!isCurrent()) return;
      if (!url) throw new Error(action === 'portal' ? 'No portal URL returned' : 'No checkout URL returned');
      navigate(url);
    } catch (error) {
      if (isCurrent()) toast.error(error instanceof Error ? error.message : 'Could not open billing. Please try again.');
    } finally {
      if (isCurrent()) { scope.pending = null; setBusy(null); }
    }
  };
  return { busy, upgrade: (plan: string) => run(plan), manage: () => run('portal') };
}
