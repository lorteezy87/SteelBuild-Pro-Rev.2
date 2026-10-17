import { describe, expect, it } from 'vitest';
import { assertBackendBundle } from '../validate-backend-bundle.js';

async function bundle(options: { index?: boolean; metadata?: string } = {}) {
  const form = new FormData();
  form.append('source', new File(['export const example = true;'], options.index === false ? 'other.ts' : 'index.ts'));
  if (options.metadata !== undefined) form.append('metadata', options.metadata);
  const response = new Response(form);
  return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get('content-type')! };
}
describe('inert rollback bundle response validation', () => {
  it.each([undefined, JSON.stringify({ deno2_entrypoint_path: 'file:///source/supabase/functions/example/index.ts' })])('parses official source parts without filesystem extraction', async metadata => {
    const source = await bundle({ metadata });
    await expect(assertBackendBundle(200, source.bytes, source.type)).resolves.toBeUndefined();
  });
  it.each([201, 204, 301, 302, 307, 308, 400, 401, 500])('rejects HTTP %i even with source parts', async status => {
    const source = await bundle();
    await expect(assertBackendBundle(status, source.bytes, source.type)).rejects.toThrow();
  });
  it.each([Buffer.alloc(0), Buffer.from('ESZIP2.3'), Buffer.from('<html>redirect</html>'.repeat(10)),
    Buffer.from(JSON.stringify({ error: 'unavailable' }))])('rejects empty, truncated or error documents', async bytes => {
    await expect(assertBackendBundle(200, bytes, 'multipart/form-data; boundary=test')).rejects.toThrow();
  });
  it('requires an index source and valid metadata', async () => {
    for (const options of [{ index: false }, { metadata: 'invalid' }, { metadata: 'null' }]) {
      const source = await bundle(options);
      await expect(assertBackendBundle(200, source.bytes, source.type)).rejects.toThrow();
    }
  });
  it('rejects a non-multipart response or oversized body', async () => {
    const source = await bundle();
    await expect(assertBackendBundle(200, source.bytes, 'text/html')).rejects.toThrow();
    await expect(assertBackendBundle(200, new Uint8Array(32 * 1024 * 1024 + 1), source.type)).rejects.toThrow();
  });
  it('bounds string parts as well as source files', async () => {
    const form = new FormData();
    form.append('source', new File(['export {};'], 'index.ts'));
    for (let index = 0; index < 256; index++) form.append(`extra${index}`, 'value');
    const response = new Response(form);
    await expect(assertBackendBundle(200, new Uint8Array(await response.arrayBuffer()), response.headers.get('content-type')!)).rejects.toThrow('Too many');
  });
});
