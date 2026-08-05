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
