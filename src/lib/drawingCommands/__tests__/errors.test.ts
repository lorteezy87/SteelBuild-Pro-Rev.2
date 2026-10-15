import { describe, expect, it } from 'vitest';
import { classifyDrawingCommandError } from '../errors';

describe('drawing command error classification', () => {
  it.each([
    ['40001', 'DRAWING_REVISION_STALE: changed'], ['42501', 'DRAWING_REVISION_NOT_AUTHORIZED: denied'],
    ['55P03', 'DRAWING_REVISION_BUSY: locked'], ['22023', 'DRAWING_REVISION_REQUEST_CONFLICT: reused'],
    ['54000', 'DRAWING_REVISION_OBSERVATION_LIMIT: large'], ['23505', 'DRAWING_REVISION_DUPLICATE: name'],
  ])('recognizes definite SQL rejection %s %s', (code, message) => {
    expect(classifyDrawingCommandError({ code, message }).kind).toBe('rejected');
  });
  it.each([
    new Error('Failed to fetch'), { code: '57014', message: 'statement timeout' },
    { code: 'PGRST202', message: 'missing RPC' }, { code: '40001', message: 'unknown proxy response' },
    { code: 'NETWORK', message: 'DRAWING_REVISION_STALE: not a SQL response' }, null,
  ])('preserves uncertain outcomes for unrecognized failures %j', (error) => {
    expect(classifyDrawingCommandError(error).kind).toBe('uncertain');
  });
});
