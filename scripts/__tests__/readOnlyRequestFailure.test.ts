import { describe, expect, it } from 'vitest';
import { isCompletedHeadAbort } from '../../e2e/readOnlyRequestFailure.js';
describe('completed bodyless HEAD response', () => {
  it('accepts Chromium abort after a successful HEAD response', () => expect(isCompletedHeadAbort('HEAD', 'net::ERR_ABORTED', true)).toBe(true));
  it.each([['GET', 'net::ERR_ABORTED', true], ['HEAD', 'net::ERR_ABORTED', false],
    ['HEAD', 'net::ERR_CONNECTION_RESET', true], ['HEAD', undefined, true]])('preserves real failures %s %s %s', (method, error, successful) => {
    expect(isCompletedHeadAbort(String(method), error as string | undefined, successful as boolean)).toBe(false);
  });
});
