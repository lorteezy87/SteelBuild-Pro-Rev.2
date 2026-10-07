import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getActiveOrgGeneration, subscribeActiveOrgChange } from '@/lib/activeOrg';
import { clearNumberedCreateRecovery, completeNumberedCreateRecovery, getNumberedCreateRecovery, retainNumberedCreateRecovery } from '@/lib/numberedCreateRecovery';

type Draft = {
  projectId: string | null;
  generation: number;
  operation: string;
  recovery: Record<string, unknown> | null;
  busy: boolean;
  invalidated: boolean;
  namespace: string;
};

/** Keep one submitted draft recoverable across lost replies without crossing scope. */
export function useNumberedCreateDraft(projectId: string | null | undefined, open: boolean, namespace: string) {
  const generation = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, getActiveOrgGeneration);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const draftRef = useRef<Draft | null>(null);
  const [, refresh] = useState(0);
  const scopeRef = useRef({ projectId: projectId || null, generation });
  scopeRef.current = { projectId: projectId || null, generation };
  if (!open) draftRef.current = null;
  else if (!draftRef.current) {
    const recovery = projectId ? getNumberedCreateRecovery(namespace, projectId) : null;
    draftRef.current = {
      projectId: projectId || null, generation, namespace, operation: recovery?.operation ?? crypto.randomUUID(),
      recovery: recovery?.payload ?? null, busy: false, invalidated: false,
    };
  }
  const draft = draftRef.current;
  if (draft && (draft.projectId !== scopeRef.current.projectId || draft.generation !== generation || draft.namespace !== namespace)) draft.invalidated = true;
  const isCurrent = () => mounted.current && !!draft && !draft.invalidated && draftRef.current === draft &&
    scopeRef.current.projectId === draft.projectId && getActiveOrgGeneration() === draft.generation;

  async function save<T extends Record<string, unknown>, R>(
    payload: T,
    create: (record: T, options: { clientOperationId: string }) => Promise<R>,
  ): Promise<R> {
    if (!draft || !isCurrent()) throw new Error('Workspace or project changed. Close and reopen this draft before saving.');
    if (!draft.projectId || payload.project_id !== draft.projectId) throw new Error('This draft belongs to a different project. Reopen it before saving.');
    if (draft.busy) throw new Error('Wait for the current save to finish.');
    const wasRecovery = !!draft.recovery;
    const attempted = structuredClone(draft.recovery ?? payload) as T;
    // A route change can unmount the editor before any reply arrives.
    const reservation = retainNumberedCreateRecovery(draft.namespace, draft.projectId, draft.operation, attempted, draft.generation);
    if (reservation === undefined) throw new Error('Another draft owns this save or it has already completed. Close and reopen to recover the current draft.');
    draft.busy = true;
    try {
      const result = await create(attempted, { clientOperationId: draft.operation });
      if (!isCurrent()) throw Object.assign(new Error('The save completed for the previous project. Reopen the original draft to recover its saved record.'), {
        outcomeUnknown: true, clientOperationId: draft.operation,
      });
      completeNumberedCreateRecovery(draft.namespace, draft.projectId, draft.operation, draft.generation);
      draft.recovery = null;
      return result;
    } catch (error) {
      if (error && typeof error === 'object' && 'outcomeUnknown' in error && error.outcomeUnknown === true) {
        draft.recovery = attempted;
        retainNumberedCreateRecovery(draft.namespace, draft.projectId, draft.operation, attempted, draft.generation);
        if (isCurrent()) refresh(value => value + 1);
      } else if (!wasRecovery) {
        clearNumberedCreateRecovery(draft.namespace, draft.projectId, draft.operation, draft.generation, reservation);
      }
      throw error;
    } finally { draft.busy = false; }
  }

  return { save, recoveryPending: !!draft?.recovery, isCurrent };
}
