import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { supabase } from './supabase';
import { getActiveOrgId, subscribeActiveOrgChange } from './activeOrg';
import { captureExportOwner } from './exportOwner';
import { createReplayClient } from './field/replayClient';

export interface WorkspaceExportOwner {
  client: SupabaseClient<Database>;
  orgId: string;
  isCurrent: () => boolean;
  assertCurrent: () => void;
  dispose: () => void;
}

/** Every page and Edge invocation uses the same bearer, including SDK token awaits. */
export async function beginWorkspaceExport(orgId: string | null | undefined, extraCheck?: () => boolean): Promise<WorkspaceExportOwner> {
  const isCurrent = captureExportOwner(() => !!orgId && getActiveOrgId() === orgId && (extraCheck?.() ?? true));
  const assertCurrent = () => { if (!isCurrent()) throw new Error('Workspace changed. Start the export again.'); };
  assertCurrent();
  const controller = new AbortController();
  const unsubscribe = subscribeActiveOrgChange(() => controller.abort());
  try {
    const { data, error } = await supabase.auth.getSession();
    assertCurrent();
    if (error || !data?.session?.user.id) throw new Error('Sign in before exporting workspace data.');
    const client = await createReplayClient(data.session.user.id, assertCurrent, controller.signal);
    assertCurrent();
    return { client, orgId: orgId as string, isCurrent, assertCurrent, dispose: unsubscribe };
  } catch (error) { unsubscribe(); throw error; }
}
