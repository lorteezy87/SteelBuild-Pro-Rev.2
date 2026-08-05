/** Pure helpers for OrgOnboarding gate. */

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function parseInviteTokenFromSearch(search: string): string | null {
  try {
    return new URLSearchParams(search).get("invite");
  } catch {
    return null;
  }
}

export type InviteLike = {
  status?: string | null;
  expired?: boolean | null;
  org_name?: string | null;
  [key: string]: unknown;
};

export function isInviteInvalid(invite: InviteLike | null | undefined): boolean {
  return !invite || invite.status !== "pending" || !!invite.expired;
}

export function canSubmitWorkspaceName(name: string, busy: boolean): boolean {
  return Boolean((name || "").trim()) && !busy;
}
