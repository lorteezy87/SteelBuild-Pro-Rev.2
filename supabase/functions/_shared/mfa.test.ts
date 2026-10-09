import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mfaDenialForVerifiedUser } from './mfa';

const userId = '11000000-5eed-4000-8000-000000000001';
const request = new Request('https://example.invalid', { headers: { Origin: 'https://steelbuild-pro.com' } });
const bearer = (claims: object) => `Bearer header.${Buffer.from(JSON.stringify({ sub: userId, ...claims })).toString('base64url')}.signature`;
const verified = { id: userId, factors: [{ status: 'verified' }] };

beforeEach(() => vi.stubGlobal('Deno', { env: { get: () => undefined } }));
afterEach(() => vi.unstubAllGlobals());

describe('server MFA guard after trusted Auth verification', () => {
  it.each(['aal1', undefined])('denies an enrolled user with %s assurance', async (aal) => {
    const response = mfaDenialForVerifiedUser(verified, bearer({ aal }), request)!;
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'mfa_required' });
    expect(response.headers.get('access-control-allow-origin')).toBe('https://steelbuild-pro.com');
  });

  it('allows enrolled AAL2', () => {
    expect(mfaDenialForVerifiedUser(verified, bearer({ aal: 'aal2' }), request)).toBeNull();
  });

  it.each([undefined, [], [{ status: 'unverified' }]])('preserves unenrolled onboarding (%j)', (factors) => {
    expect(mfaDenialForVerifiedUser({ id: userId, factors }, bearer({ aal: 'aal1' }), request)).toBeNull();
  });

  it('does not let an unverified factor mask a verified factor', () => {
    const user = { id: userId, factors: [{ status: 'unverified' }, { status: 'verified' }] };
    expect(mfaDenialForVerifiedUser(user, bearer({ aal: 'aal1' }), request)?.status).toBe(403);
  });

  it.each(['malformed', 'Bearer a.b.c', bearer({ sub: 'other-user', aal: 'aal2' }), bearer({ aal: 'aal3' })])(
    'rejects invalid or mismatched claims: %s', (token) => {
      expect(mfaDenialForVerifiedUser(verified, token, request)?.status).toBe(401);
    },
  );

  it.each([null, {}, [null], [{ status: 'unexpected' }]])('fails closed on malformed enrollment data (%j)', (factors) => {
    const user = { id: userId, factors } as unknown as Parameters<typeof mfaDenialForVerifiedUser>[0];
    expect(mfaDenialForVerifiedUser(user, bearer({ aal: 'aal2' }), request)?.status).toBe(503);
  });

  it('ignores user editable metadata which claims MFA is disabled', () => {
    const user = { ...verified, user_metadata: { factors: [], aal: 'aal2' } };
    expect(mfaDenialForVerifiedUser(user, bearer({ aal: 'aal1' }), request)?.status).toBe(403);
  });
});
