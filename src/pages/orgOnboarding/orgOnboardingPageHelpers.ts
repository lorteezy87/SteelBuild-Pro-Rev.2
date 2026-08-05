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

export const ONBOARDING_H_STYLE: Record<string, string | number> = {
  fontFamily: "'Space Grotesk', var(--font-display)",
  fontSize: 24,
  fontWeight: 600,
  color: "var(--text-primary)",
  margin: "10px 0 6px",
};

export const ONBOARDING_P_STYLE: Record<string, string | number> = {
  color: "var(--text-muted)",
  fontSize: 13,
  lineHeight: 1.6,
  margin: "0 0 22px",
};
