import { describe, expect, it } from 'vitest';
import { totp } from '../staging-backend-acceptance/totp.ts';

describe('staging MFA TOTP', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']])
    ('matches RFC 6238 at %s seconds', (seconds, expected) => {
      expect(totp(secret, Number(seconds) * 1000)).toBe(expected);
    });
  it('rejects malformed enrollment secrets', () => { expect(() => totp('not-a-secret')).toThrow(); });
});
