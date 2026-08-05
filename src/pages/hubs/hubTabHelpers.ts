/** Shared pure tab-key resolution for thin hub shells. */

export function resolveHubTabKey(
  param: string | null | undefined,
  tabKeys: readonly string[],
  fallback: string,
): string {
  return tabKeys.includes(param || "") ? (param as string) : fallback;
}

/** Immutable URLSearchParams mutator: set hub tab query key. */
export function nextHubTabParams(
  prev: URLSearchParams | Record<string, string> | string,
  paramName: string,
  key: string,
): URLSearchParams {
  const next = new URLSearchParams(prev as any);
  next.set(paramName, key);
  return next;
}

/** Drop one or more keys from the query string (handoff cleanup, etc.). */
export function nextSearchParamsWithout(
  prev: URLSearchParams | Record<string, string> | string,
  keys: readonly string[],
): URLSearchParams {
  const next = new URLSearchParams(prev as any);
  for (const key of keys) next.delete(key);
  return next;
}

/**
 * Apply a sparse patch of query values. `null` / `undefined` deletes the key;
 * other values are stringified via String().
 */
export function nextSearchParamsPatch(
  prev: URLSearchParams | Record<string, string> | string,
  patch: Record<string, string | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(prev as any);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") next.delete(key);
    else next.set(key, String(value));
  }
  return next;
}
