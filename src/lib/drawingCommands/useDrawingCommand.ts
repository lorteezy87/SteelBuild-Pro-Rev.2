import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';
import { getActiveOrgGeneration, getActiveOrgId, subscribeActiveOrgChange } from '@/lib/activeOrg';
import { getDrawingCommandReceipt, type DrawingCommandFence } from '@/api/client/drawingCommands';
import { DrawingCommandPreflightError } from './errors';
import { assertDrawingCommandReserved, completeDrawingCommand, decodeDrawingCommand, DrawingCommandJournalError, loadDrawingCommands, saveDrawingCommand, withDrawingCommandLock } from './journal';
import { reconcileDrawingCommand } from './recovery';
import type { DrawingCommandFailure, DrawingCommandOutcome, DrawingCommandOwner, DrawingCommandResult, ReviewedDrawingCommand } from './types';

export type DrawingCommandState = 'unavailable' | 'reviewing' | 'pending' | 'committed' | 'rejected' | 'uncertain';
export interface DrawingCommandHookOptions {
  /** Cache/schedule follow-up, not another drawing write. Check fence after your own awaits. Failure retains the receipt for explicit retry. */
  readonly onCommitted?: (result: DrawingCommandResult, draft: ReviewedDrawingCommand, fence: DrawingCommandFence) => void | Promise<void>;
}
interface View {
  state: DrawingCommandState;
  draft: ReviewedDrawingCommand | null;
  error: DrawingCommandFailure | null;
  outcome: DrawingCommandOutcome | null;
}
interface Scope {
  key: string;
  owner: DrawingCommandOwner | null;
  generation: number;
  busy: boolean;
  ready: boolean;
  rejected: boolean;
  view: View;
}
const emptyView = (): View => ({ state: 'unavailable', draft: null, error: null, outcome: null });
const identity = (owner: DrawingCommandOwner | null) => owner ? JSON.stringify([owner.actorId, owner.orgId, owner.projectId]) : '';

/** Explicit, owner-fenced actions. Mount/sign-in only read this owner's local journal; neither ever replays. */
export function useDrawingCommand(owner: DrawingCommandOwner | null, options: DrawingCommandHookOptions = {}) {
  const generation = useSyncExternalStore(subscribeActiveOrgChange, getActiveOrgGeneration, getActiveOrgGeneration);
  const [authEpoch, setAuthEpoch] = useState(0);
  const authBlocked = useRef(false);
  const lifetime = useRef(0);
  const mounted = useRef(false);
  const scopeRef = useRef<Scope | null>(null);
  const [view, setView] = useState<{ scope: Scope; value: View } | null>(null);
  const key = JSON.stringify([identity(owner), generation, authEpoch]);
  if (scopeRef.current?.key !== key) {
    scopeRef.current = { key, owner: owner ? { ...owner } : null, generation, busy: false, ready: false, rejected: false, view: emptyView() };
  }
  const scope = scopeRef.current;

  useLayoutEffect(() => {
    mounted.current = true;
    ++lifetime.current;
    return () => { mounted.current = false; ++lifetime.current; };
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const invalid = event === 'SIGNED_OUT' || !session?.user || session.user.id !== scopeRef.current?.owner?.actorId;
      if (invalid || authBlocked.current) {
        authBlocked.current = invalid;
        ++lifetime.current; // Synchronous invalidation; do not await inside the Auth callback.
        setAuthEpoch((value) => value + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  function fenceForScope(): { assertCurrent: () => void } {
    const visit = lifetime.current;
    return { assertCurrent: () => {
      if (!mounted.current || lifetime.current !== visit || scopeRef.current !== scope || authBlocked.current || !scope.owner
        || getActiveOrgId() !== scope.owner.orgId || getActiveOrgGeneration() !== scope.generation) {
        throw new DrawingCommandPreflightError('identity_changed');
      }
    } };
  }
  function publish(next: View): void {
    scope.view = next;
    setView({ scope, value: next });
  }
  async function assertActor(fence: { assertCurrent: () => void }): Promise<void> {
    fence.assertCurrent();
    const { data, error } = await supabase.auth.getUser();
    fence.assertCurrent();
    if (error || !data.user || data.user.id !== scope.owner?.actorId) throw new DrawingCommandPreflightError('identity_changed');
  }

  useEffect(() => {
    const visit = lifetime.current;
    let cancelled = false;
    const current = () => !cancelled && mounted.current && lifetime.current === visit && scopeRef.current === scope
      && !authBlocked.current && !!scope.owner && getActiveOrgId() === scope.owner.orgId && getActiveOrgGeneration() === scope.generation;
    if (!current() || !scope.owner) return;
    const load = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!current()) return;
        if (error || data.user?.id !== scope.owner!.actorId) throw new DrawingCommandPreflightError('identity_changed');
        const drafts = await loadDrawingCommands(scope.owner!);
        if (!current()) return;
        scope.ready = true;
        scope.view = { state: 'reviewing', draft: drafts[0] ?? null, error: null, outcome: null };
        setView({ scope, value: scope.view });
      } catch {
        if (current()) {
          scope.view = { ...emptyView(), error: { code: 'recovery_unavailable', message: 'This owner’s saved drawing command could not be loaded.' } };
          setView({ scope, value: scope.view });
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [scope]);

  async function prepare(draft: ReviewedDrawingCommand): Promise<void> {
    const fence = fenceForScope();
    fence.assertCurrent();
    if (!scope.ready || scope.busy) throw new DrawingCommandPreflightError('unavailable');
    const snapshot = decodeDrawingCommand(draft);
    if (identity(snapshot.owner) !== identity(scope.owner)) throw new DrawingCommandPreflightError('identity_changed');
    scope.busy = true;
    try {
      await assertActor(fence);
      await saveDrawingCommand(snapshot);
      fence.assertCurrent();
      scope.rejected = false;
      publish({ state: 'reviewing', draft: snapshot, error: null, outcome: null });
    } catch (error) {
      try { fence.assertCurrent(); } catch { throw error; }
      if (!(error instanceof DrawingCommandJournalError && error.code === 'reservation_conflict')) {
        publish({ ...scope.view, state: 'unavailable', error: { code: 'prepare_failed', message: 'The reviewed command could not be safely saved for this owner.' } });
      }
      throw error;
    } finally { scope.busy = false; }
  }

  async function acknowledge(draft: ReviewedDrawingCommand, outcome: Extract<DrawingCommandOutcome, { kind: 'committed' }>, fence: { assertCurrent: () => void }): Promise<void> {
    fence.assertCurrent();
    publish({ state: 'committed', draft, error: null, outcome });
    try {
      await options.onCommitted?.(outcome.result, draft, fence);
      fence.assertCurrent();
      await completeDrawingCommand(draft.owner, draft.requestId);
      fence.assertCurrent();
      scope.rejected = false;
      publish({ state: 'committed', draft: null, error: null, outcome });
    } catch {
      // Committed remains committed even when follow-up/storage fails or this UI has disappeared.
      try { fence.assertCurrent(); } catch { return; }
      publish({ state: 'committed', draft, outcome, error: { code: 'acknowledgement_failed', message: 'The drawing command committed. Retry receipt reconciliation to finish local follow-up.' } });
    }
  }

  async function run(): Promise<DrawingCommandOutcome> {
    const fence = fenceForScope();
    fence.assertCurrent();
    const draft = scope.view.draft;
    if (!scope.ready || scope.busy || !draft) throw new DrawingCommandPreflightError('unavailable');
    // This outcome belongs to this exact retained draft in the current owner scope.
    // Once observed, receipt trouble can only delay acknowledgement, never undo the commit.
    const knownCommit = scope.view.outcome?.kind === 'committed' ? scope.view.outcome : null;
    scope.busy = true;
    if (!knownCommit) publish({ ...scope.view, state: 'pending', error: null });
    try {
      await assertActor(fence);
      if (knownCommit) {
        const receipt = await withDrawingCommandLock(draft.owner, async () => {
          await assertDrawingCommandReserved(draft);
          fence.assertCurrent();
          return getDrawingCommandReceipt(draft, fence);
        });
        fence.assertCurrent();
        if (receipt.state === 'committed') await acknowledge(draft, knownCommit, fence);
        else publish({ state: 'committed', draft, outcome: knownCommit, error: {
          code: 'acknowledgement_pending', message: 'The drawing command committed. Follow-up remains incomplete because its latest receipt could not confirm acknowledgement. Do not create another copy.',
        } });
        return knownCommit;
      }
      const outcome = await reconcileDrawingCommand(draft, fence);
      // Logical cancellation does not change a dispatched command's outcome or erase its journal.
      try { fence.assertCurrent(); } catch { return outcome; }
      if (outcome.kind === 'committed') await acknowledge(draft, outcome, fence);
      else {
        scope.rejected ||= outcome.kind === 'rejected';
        publish({ state: outcome.kind, draft, error: outcome.error, outcome });
      }
      return outcome;
    } catch (error) {
      try { fence.assertCurrent(); } catch { throw error; }
      if (knownCommit) publish({ state: 'committed', draft, outcome: knownCommit, error: {
        code: 'acknowledgement_failed', message: 'The drawing command committed. Follow-up receipt recovery is unavailable; the saved request is retained. Do not create another copy.',
      } });
      else publish({ ...scope.view, state: error instanceof DrawingCommandPreflightError || error instanceof DrawingCommandJournalError ? 'unavailable' : 'uncertain',
        error: { code: 'recovery_failed', message: 'The saved command remains unresolved. Its receipt could not be safely reconciled.' } });
      throw error;
    } finally { scope.busy = false; }
  }

  /** Explicit review dismissal, not server cancellation or a promise that another already dispatched tab cannot commit. */
  async function dismissSavedReview(): Promise<boolean> {
    const fence = fenceForScope();
    fence.assertCurrent();
    const draft = scope.view.draft;
    if (!scope.ready || scope.busy || !draft) throw new DrawingCommandPreflightError('unavailable');
    if (scope.view.outcome?.kind === 'committed') {
      await run(); // Known commits are acknowledgement-only, never uncommitted-review deletion.
      return false;
    }
    scope.busy = true;
    try {
      await assertActor(fence);
      const receipt = await withDrawingCommandLock(draft.owner, async (journal) => {
        await assertDrawingCommandReserved(draft);
        fence.assertCurrent();
        const checked = await getDrawingCommandReceipt(draft, fence);
        fence.assertCurrent();
        if (checked.state === 'not_committed') await journal.complete(draft.requestId);
        return checked;
      });
      fence.assertCurrent();
      if (receipt.state === 'committed') {
        await acknowledge(draft, { kind: 'committed', result: receipt.result }, fence);
        return false;
      }
      if (receipt.state === 'pending') return false;
      ++lifetime.current; // Any older callback from this hook visit is now stale.
      scope.rejected = false;
      publish({ state: 'reviewing', draft: null, error: null, outcome: null });
      return true;
    } finally { scope.busy = false; }
  }

  async function dismissRejected(): Promise<boolean> {
    if (!scope.rejected) throw new DrawingCommandPreflightError('unavailable');
    return dismissSavedReview();
  }

  const visible = view?.scope === scope ? view.value : emptyView();
  return { ...visible, prepare, apply: run, reconcile: run, dismissRejected, dismissSavedReview };
}
