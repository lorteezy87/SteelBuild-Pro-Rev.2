import { describe, expect, it } from 'vitest';
import { assertBackendBundle } from '../validate-backend-bundle.js';

const bundle = (magic = 'ESZIP2.3') => Buffer.concat([Buffer.from(magic), Buffer.alloc(128)]);
describe('inert rollback bundle response validation', () => {
  it.each(['ESZIP_V2', 'ESZIP2.1', 'ESZIP2.2', 'ESZIP2.3'])('accepts HTTP 200 with recognized %s signature', magic => {
    expect(() => assertBackendBundle(200, bundle(magic))).not.toThrow();
  });
  it.each([201, 204, 301, 302, 307, 308, 400, 401, 500])('rejects HTTP %i even with bundle-shaped bytes', status => {
    expect(() => assertBackendBundle(status, bundle())).toThrow();
  });
  it.each([Buffer.alloc(0), Buffer.from('ESZIP2.3'), Buffer.from('<html>redirect</html>'.repeat(10)),
    Buffer.from(JSON.stringify({ error: 'unavailable' })), bundle('ESZIP2.9')])('rejects empty, truncated, error or unknown bytes', bytes => {
    expect(() => assertBackendBundle(200, bytes)).toThrow();
  });
});
