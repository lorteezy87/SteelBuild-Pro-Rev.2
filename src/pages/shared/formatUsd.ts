/** Compact USD display used by several financial page shells. */
export function formatUsd(n: unknown): string {
  return `$${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}
