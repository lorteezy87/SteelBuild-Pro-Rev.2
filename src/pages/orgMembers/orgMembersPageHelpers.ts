/** Pure helpers for OrgMembers page shell. */
export type StagedSkipCounts = {
  alreadyMember?: number;
  alreadyInvited?: number;
  invalid?: number;
  duplicate?: number;
} | null;

export function buildStagedSkippedNote(stagedSkipped: StagedSkipCounts): string {
  if (!stagedSkipped) return "";
  const parts: string[] = [];
  if (stagedSkipped.alreadyMember) parts.push(`${stagedSkipped.alreadyMember} already on the team`);
  if (stagedSkipped.alreadyInvited) parts.push(`${stagedSkipped.alreadyInvited} already invited`);
  if (stagedSkipped.invalid) parts.push(`${stagedSkipped.invalid} invalid`);
  if (stagedSkipped.duplicate) parts.push(`${stagedSkipped.duplicate} duplicate`);
  return parts.length ? `Skipped ${parts.join(", ")}.` : "";
}

export function countOwners(members: Array<{ role?: string | null }>): number {
  return (members || []).filter((m) => m.role === "owner").length;
}

export function updateStagedRoleAt<T extends { role?: string }>(
  rows: T[],
  idx: number,
  nextRole: string,
): T[] {
  return (rows || []).map((row, i) => (i === idx ? { ...row, role: nextRole } : row));
}

export function removeStagedAt<T>(rows: T[], idx: number): T[] {
  return (rows || []).filter((_, i) => i !== idx);
}

export type InviteSendResult = { email: string; ok: boolean };

export type InviteSendSummary = {
  okCount: number;
  failCount: number;
  failedEmails: Set<string>;
  successToast: string | null;
  errorToast: string | null;
};

/** Summarize batch invite create results + keep only failed staged rows. */
export function summarizeInviteSendResults(
  results: InviteSendResult[],
): InviteSendSummary {
  const okCount = (results || []).filter((r) => r.ok).length;
  const failCount = (results || []).length - okCount;
  const failedEmails = new Set(
    (results || []).filter((r) => !r.ok).map((r) => r.email),
  );
  let successToast: string | null = null;
  let errorToast: string | null = null;
  if (okCount) {
    successToast = `Created ${okCount} invite${okCount === 1 ? "" : "s"}${
      failCount ? `, ${failCount} couldn't be sent` : ""
    } — copy links from Pending invites below`;
  } else if (failCount) {
    errorToast =
      "Couldn't create invites — seat limit reached, or they're already invited";
  }
  return { okCount, failCount, failedEmails, successToast, errorToast };
}

export function keepFailedStagedRows<T extends { email?: string | null }>(
  rows: T[],
  failedEmails: Set<string>,
): T[] {
  return (rows || []).filter((row) => failedEmails.has(row.email as string));
}

