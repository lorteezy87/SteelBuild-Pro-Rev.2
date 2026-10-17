import { describe, expect, it } from 'vitest';
import { isCompletedHeadAbort, isCompletedLogoutAbort } from '../../e2e/readOnlyRequestFailure.js';
describe('completed bodyless HEAD response', () => {
  it('accepts Chromium abort after a successful HEAD response', () => expect(isCompletedHeadAbort('HEAD', 'net::ERR_ABORTED', true)).toBe(true));
  it.each([['GET', 'net::ERR_ABORTED', true], ['HEAD', 'net::ERR_ABORTED', false],
    ['HEAD', 'net::ERR_CONNECTION_RESET', true], ['HEAD', undefined, true]])('preserves real failures %s %s %s', (method, error, successful) => {
    expect(isCompletedHeadAbort(String(method), error as string | undefined, successful as boolean)).toBe(false);
  });
});

describe('completed explicit bodyless logout response', () => {
  it('accepts only an opted-in POST logout with an observed 204 and Chromium abort', () => {
    expect(isCompletedLogoutAbort('POST', '/auth/v1/logout', 'net::ERR_ABORTED', true, true)).toBe(true);
  });
  it.each([
    ['GET', '/auth/v1/logout', 'net::ERR_ABORTED', true, true],
    ['POST', '/auth/v1/logout', 'net::ERR_ABORTED', false, true],
    ['POST', '/auth/v1/logout', 'net::ERR_ABORTED', true, false],
    ['POST', '/auth/v1/logout', 'net::ERR_CONNECTION_RESET', true, true],
    ['POST', '/rest/v1/rpc/logout', 'net::ERR_ABORTED', true, true],
  ])('preserves all other failures', (method, path, error, allowed, observed) => {
    expect(isCompletedLogoutAbort(method as string, path as string, error as string, allowed as boolean, observed as boolean)).toBe(false);
  });
});
