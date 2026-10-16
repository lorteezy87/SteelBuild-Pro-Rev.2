import type { DrawingCommandOutcome } from './types.ts';

/** No command was dispatched. Distinct from a write whose transport outcome is unknown. */
export class DrawingCommandPreflightError extends Error {
  readonly dispatched = false;
  readonly code: 'invalid_review' | 'identity_changed' | 'unavailable';
  constructor(code: 'invalid_review' | 'identity_changed' | 'unavailable') {
    super(`Drawing command preflight failed: ${code}`);
    this.code = code;
    this.name = 'DrawingCommandPreflightError';
  }
}

/** Parsing/lookup failed; never evidence that a dispatched command rolled back. */
export class DrawingCommandResponseError extends Error {
  constructor() { super('Drawing command response could not be verified'); this.name = 'DrawingCommandResponseError'; }
}

const sqlRejections: Readonly<Record<string, readonly string[]>> = {
  '40001': ['ISOLATION', 'STALE', 'SOURCE_CHANGED', 'SET_UNAVAILABLE'],
  '42501': ['NOT_AUTHORIZED'],
  '22023': ['INVALID', 'SOURCE_SCOPE', 'SOURCE_MISSING', 'REQUEST_CONFLICT', 'TRACKING_REQUIRED', 'EXTRACTION', 'TOPOLOGY', 'HOLD'],
  '54000': ['LIMIT', 'OBSERVATION_LIMIT'],
  '23505': ['DUPLICATE'],
  '55P03': ['BUSY'],
};
export function classifyDrawingCommandError(error: unknown): Exclude<DrawingCommandOutcome, { kind: 'committed' }> {
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error
    && typeof error.code === 'string' && typeof error.message === 'string') {
    const name = /^DRAWING_REVISION_([A-Z_]+):/.exec(error.message)?.[1];
    const transition = /^DRAWING_COMMAND_TRANSITION:/.test(error.message) && ['42501', '40001', '54000'].includes(error.code);
    if (transition || (name && sqlRejections[error.code]?.includes(name))) {
      return { kind: 'rejected', error: { code: transition ? 'DRAWING_COMMAND_TRANSITION' : `DRAWING_REVISION_${name}`, message: 'The server rejected this drawing command.' } };
    }
  }
  // Never echo arbitrary transport text: it can contain signed URLs or request details.
  return { kind: 'uncertain', error: { code: 'outcome_uncertain', message: 'The write outcome is unknown. Look up this same reviewed request before retrying.' } };
}
