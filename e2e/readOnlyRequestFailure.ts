/** Chromium can report ERR_ABORTED after receiving a successful bodyless HEAD.
 * Never exempt GETs, unanswered/failed HEADs, or any other network error.
 */
export function isCompletedHeadAbort(method: string, error: string | undefined, successfulHead: boolean): boolean {
  return method === 'HEAD' && error === 'net::ERR_ABORTED' && successfulHead;
}

/** The same Chromium behavior occurs for an explicitly allowed 204 logout.
 * Caller must observe that exact request's 204, not merely a cleared UI session.
 */
export function isCompletedLogoutAbort(method: string, path: string, error: string | undefined, allowed: boolean, observed204: boolean): boolean {
  return allowed && observed204 && method === 'POST' && path === '/auth/v1/logout' && error === 'net::ERR_ABORTED';
}
