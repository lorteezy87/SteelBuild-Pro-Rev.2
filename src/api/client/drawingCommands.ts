import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { buildCreateSetRequest, buildReviseSetRequest, validateDrawingSourcePath } from '@/lib/drawingCommands/requestBuilders';
import { classifyDrawingCommandError, DrawingCommandPreflightError, DrawingCommandResponseError } from '@/lib/drawingCommands/errors';
import { parseDrawingCommandReceipt, parseDrawingCommandResult } from '@/lib/drawingCommands/responses';
export { parseDrawingCommandResult } from '@/lib/drawingCommands/responses';
import type {
  DrawingCommandCapabilities, DrawingCommandOutcome, DrawingCommandReceipt,
  DrawingSourceObject, ReviewedDrawingCommand,
} from '@/lib/drawingCommands/types';
import type { Json } from '@/types/supabase';

const uuid = z.string().uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const capabilitiesSchema = z.object({
  contract_version: z.literal(1), new_set: z.boolean(), revision: z.boolean(), write_boundary: z.boolean(),
  source_protection: z.boolean(), receipt_lookup: z.boolean(),
}).strict();
const sourceSchema = z.object({ path: z.string(), token: hash }).strict();

/** The capability endpoint is readiness only, never a client authorization decision. */
export async function getDrawingCommandCapabilities(projectId: string): Promise<DrawingCommandCapabilities> {
  if (!uuid.safeParse(projectId).success) throw new DrawingCommandPreflightError('invalid_review');
  try {
    const { data, error } = await supabase.rpc('get_drawing_command_capabilities', { p_project_id: projectId });
    const parsed = capabilitiesSchema.safeParse(data);
    if (error || !parsed.success) throw new DrawingCommandPreflightError('unavailable');
    return parsed.data as DrawingCommandCapabilities;
  } catch { throw new DrawingCommandPreflightError('unavailable'); }
}

export async function getDrawingRevisionSources(projectId: string, paths: readonly string[]): Promise<readonly DrawingSourceObject[]> {
  if (!uuid.safeParse(projectId).success || paths.length < 1 || paths.length > 250 || new Set(paths).size !== paths.length
    || paths.some((path) => !validateDrawingSourcePath(path, projectId))) throw new DrawingCommandPreflightError('invalid_review');
  const { data, error } = await supabase.rpc('get_drawing_revision_sources', { p_project_id: projectId, p_paths: [...paths] });
  const parsed = z.array(sourceSchema).min(1).max(250).safeParse(data);
  if (error || !parsed.success || parsed.data.length !== paths.length
    || new Set(parsed.data.map(({ path }) => path)).size !== paths.length
    || parsed.data.some(({ path }) => !paths.includes(path))) throw new DrawingCommandResponseError();
  return parsed.data as DrawingSourceObject[];
}

async function prepareDraft(draft: ReviewedDrawingCommand): Promise<ReviewedDrawingCommand> {
  const identity = z.object({ version: z.literal(1), requestId: uuid, operation: z.enum(['create_set', 'revise_set']),
    owner: z.object({ actorId: uuid, orgId: uuid, projectId: uuid }).strict(), payload: z.unknown(),
  }).strict().safeParse(draft);
  if (!identity.success || draft.owner.projectId !== draft.payload?.project_id) throw new DrawingCommandPreflightError('invalid_review');
  const payload = draft.operation === 'create_set' ? buildCreateSetRequest(draft.payload) : buildReviseSetRequest(draft.payload);
  if (!payload.source_objects.every(({ path }) => validateDrawingSourcePath(path, draft.owner.projectId, draft.owner.orgId))) {
    throw new DrawingCommandPreflightError('invalid_review');
  }
  // Snapshot before awaiting Auth/network so caller mutation cannot change a reviewed dispatch.
  const snapshot = Object.freeze({ ...draft, owner: Object.freeze({ ...draft.owner }), payload }) as ReviewedDrawingCommand;
  await assertCurrentActor(snapshot.owner.actorId);
  return snapshot;
}

async function assertCurrentActor(actorId: string): Promise<void> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user || data.user.id !== actorId) throw new DrawingCommandPreflightError('identity_changed');
  } catch { throw new DrawingCommandPreflightError('identity_changed'); }
}

/** Local cancellation only; never authority for SQL and never a claim of server rollback. */
export interface DrawingCommandFence {
  readonly assertCurrent?: () => void;
  /** Optional durable-reservation coordinator. Call send exactly once while holding its owner lock. */
  readonly dispatch?: (send: () => Promise<DrawingCommandOutcome>) => Promise<DrawingCommandOutcome>;
}

/** Preflight throws explicitly; only an attempted command RPC returns a write outcome. Never retries or falls back. */
export async function applyDrawingCommand(draft: ReviewedDrawingCommand, fence: DrawingCommandFence = {}): Promise<DrawingCommandOutcome> {
  fence.assertCurrent?.();
  const snapshot = await prepareDraft(draft);
  fence.assertCurrent?.();
  const capabilities = await getDrawingCommandCapabilities(snapshot.owner.projectId);
  fence.assertCurrent?.();
  if (!capabilities.new_set || !capabilities.revision || !capabilities.write_boundary || !capabilities.source_protection || !capabilities.receipt_lookup) {
    throw new DrawingCommandPreflightError('unavailable');
  }
  await assertCurrentActor(snapshot.owner.actorId);
  fence.assertCurrent?.();
  let dispatched = false;
  let guardActive = true;
  const send = (): Promise<DrawingCommandOutcome> => {
    if (!guardActive || dispatched) throw new DrawingCommandPreflightError('unavailable');
    fence.assertCurrent?.();
    dispatched = true;
    return sendDrawingCommand(snapshot);
  };
  try {
    const outcome = await (fence.dispatch ? fence.dispatch(send) : send());
    if (!dispatched) throw new DrawingCommandPreflightError('unavailable');
    return outcome;
  } catch (error) {
    // RPC errors are classified inside sendDrawingCommand. A guard failure is never SQL rejection evidence.
    if (dispatched) return classifyDrawingCommandError(undefined);
    if (error instanceof DrawingCommandPreflightError) throw error;
    throw new DrawingCommandPreflightError('unavailable');
  } finally { guardActive = false; }
}

async function sendDrawingCommand(snapshot: ReviewedDrawingCommand): Promise<DrawingCommandOutcome> {
  try {
    const { data, error } = await supabase.rpc(snapshot.operation === 'create_set' ? 'create_drawing_set_from_review' : 'apply_drawing_set_revision', {
      p_request_id: snapshot.requestId, p_request: snapshot.payload as unknown as Json,
    });
    if (error) return classifyDrawingCommandError(error);
    return { kind: 'committed', result: parseDrawingCommandResult(data, snapshot) };
  } catch (error: unknown) { return classifyDrawingCommandError(error); }
}

/** Lookup uses the same complete reviewed JSON; server hash and actor namespace are authoritative. */
export async function getDrawingCommandReceipt(draft: ReviewedDrawingCommand, fence: DrawingCommandFence = {}): Promise<DrawingCommandReceipt> {
  fence.assertCurrent?.();
  const snapshot = await prepareDraft(draft);
  fence.assertCurrent?.();
  const { data, error } = await supabase.rpc('get_drawing_command_receipt', {
    p_request_id: snapshot.requestId, p_operation: snapshot.operation, p_request: snapshot.payload as unknown as Json,
  });
  if (error) throw new DrawingCommandResponseError();
  return parseDrawingCommandReceipt(data, snapshot);
}
