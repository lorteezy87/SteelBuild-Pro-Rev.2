/** Chromium can report ERR_ABORTED after receiving a successful bodyless HEAD.
 * Never exempt GETs, unanswered/failed HEADs, or any other network error.
 */
export function isCompletedHeadAbort(method: string, error: string | undefined, successfulHead: boolean): boolean {
  return method === 'HEAD' && error === 'net::ERR_ABORTED' && successfulHead;
}
