/** Pure helpers for Billing page shell. */
export function countPendingInvites(
  orgInvites: Array<{ status?: string | null }>,
): number {
  return (orgInvites || []).filter((i) => i.status === "pending").length;
}
