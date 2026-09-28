import { describe, expect, it } from 'vitest';
import { readEdgeFunctionErrorBody } from '@/lib/edgeFunctionError';

describe('readEdgeFunctionErrorBody', () => {
  it("returns the function's JSON body from a FunctionsHttpError's context", async () => {
    const error = { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'X', detail: 'why' }) } };
    await expect(readEdgeFunctionErrorBody(error)).resolves.toEqual({ error: 'X', detail: 'why' });
  });

  it('returns null without a readable JSON object', async () => {
    await expect(readEdgeFunctionErrorBody({ message: 'network' })).resolves.toBeNull();
    await expect(readEdgeFunctionErrorBody(null)).resolves.toBeNull();
    await expect(readEdgeFunctionErrorBody({ context: { json: async () => { throw new Error('not json'); } } })).resolves.toBeNull();
    await expect(readEdgeFunctionErrorBody({ context: { json: async () => 'plain text' } })).resolves.toBeNull();
  });
});
