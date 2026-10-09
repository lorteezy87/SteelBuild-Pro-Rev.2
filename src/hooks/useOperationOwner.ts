import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getActiveOrgGeneration, subscribeActiveOrgChange } from '@/lib/activeOrg';

export interface OperationOwner {
  isCurrent: () => boolean;
  assertCurrent: () => void;
}

/** Capture at the user action, before any await; old owners never revive. */
export function useOperationOwner(scope: string | null | undefined) {
  const generation = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, getActiveOrgGeneration);
  const current = useRef({ scope, generation });
  if (current.current.scope !== scope || current.current.generation !== generation) current.current = { scope, generation };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const origin = current.current;
  return (): OperationOwner => {
    const isCurrent = () => mounted.current && current.current === origin && getActiveOrgGeneration() === origin.generation;
    return { isCurrent, assertCurrent: () => { if (!isCurrent()) throw new Error('Workspace or project changed. Reopen this operation.'); } };
  };
}
