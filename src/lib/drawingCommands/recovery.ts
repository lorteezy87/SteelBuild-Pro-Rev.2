import { applyDrawingCommand, getDrawingCommandReceipt, type DrawingCommandFence } from '@/api/client/drawingCommands';
import { assertDrawingCommandReserved, decodeDrawingCommand } from './journal';
import type { DrawingCommandOutcome, ReviewedDrawingCommand } from './types';

/** Explicit user action only. A failed lookup is never evidence of rollback, and pending never replays. */
export async function reconcileDrawingCommand(draft: ReviewedDrawingCommand, fence: DrawingCommandFence = {}): Promise<DrawingCommandOutcome> {
  const snapshot = decodeDrawingCommand(draft);
  fence.assertCurrent?.();
  await assertDrawingCommandReserved(snapshot);
  fence.assertCurrent?.();
  const receipt = await getDrawingCommandReceipt(snapshot, fence);
  // A committed result stays committed even if the caller's workspace has since changed.
  if (receipt.state === 'committed') return { kind: 'committed', result: receipt.result };
  fence.assertCurrent?.();
  if (receipt.state === 'pending') return { kind: 'uncertain', error: { code: 'receipt_pending', message: 'This reviewed command is still pending. Look up its receipt again.' } };
  await assertDrawingCommandReserved(snapshot);
  fence.assertCurrent?.();
  return applyDrawingCommand(snapshot, fence);
}
