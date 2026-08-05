/** Shared pure tab-key resolution for thin hub shells. */

export function resolveHubTabKey(
  param: string | null | undefined,
  tabKeys: readonly string[],
  fallback: string,
): string {
  return tabKeys.includes(param || "") ? (param as string) : fallback;
}
