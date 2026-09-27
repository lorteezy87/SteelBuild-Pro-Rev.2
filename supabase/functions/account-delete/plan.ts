// Pure decision logic for account-delete, kept free of Deno/Supabase imports so
// it is unit-tested in the normal vitest run (see __tests__/plan.test.ts).

/**
 * `hard_delete_organization(p_org_id uuid, p_reason text)` has no default for
 * p_reason and rejects reasons shorter than 12 characters (it is written to
 * data_erasure_log / account_deletions). Calling it without one makes
 * PostgREST fail to find the function at all, which is how every erasure
 * through this Edge Function used to fail.
 */
export const ACCOUNT_ERASURE_REASON = "Account deleted by the workspace's only member";
export const WORKSPACE_ERASURE_REASON = "Workspace deleted by its owner";

export function eraseOrgArgs(orgId: string, reason: string): { p_org_id: string; p_reason: string } {
  return { p_org_id: orgId, p_reason: reason };
}

/** Arguments for `erase_my_sole_member_workspaces(p_reason text)` (20260927160000). */
export function eraseSoleWorkspacesArgs(reason: string): { p_reason: string } {
  return { p_reason: reason };
}

/**
 * The org and project ids `erase_my_sole_member_workspaces` erased, for the
 * Storage purge. Anything but a string in either list is ignored, so a
 * malformed body purges nothing rather than the wrong prefix.
 */
export function erasedWorkspaceIds(result: unknown): { orgIds: string[]; projectIds: string[] } {
  const body = (result ?? {}) as { org_ids?: unknown; project_ids?: unknown };
  const ids = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  return { orgIds: ids(body.org_ids), projectIds: ids(body.project_ids) };
}

export interface OrgRoster {
  orgId: string;
  orgName: string;
  members: Array<{ userId: string; role: string }>;
}

export interface AccountDeletionPlan {
  /** Workspaces where the caller is the only member (and owner): erased with the account. */
  erase: OrgRoster[];
  /** Workspaces the caller simply leaves: their membership goes with the account. */
  leave: OrgRoster[];
  /**
   * Workspaces the caller is the only owner of while other people are members.
   * Deleting the account must not take those people's workspace or logins with
   * it, so deletion is refused until another member is made an owner.
   */
  blocked: OrgRoster[];
}

/** Decide, before anything is destroyed, what deleting `callerId` does to each workspace. */
export function planAccountDeletion(callerId: string, orgs: OrgRoster[]): AccountDeletionPlan {
  const plan: AccountDeletionPlan = { erase: [], leave: [], blocked: [] };
  for (const org of orgs) {
    const caller = org.members.find((m) => m.userId === callerId);
    const others = org.members.filter((m) => m.userId !== callerId);
    const callerOwns = caller?.role === "owner";
    if (others.length === 0) {
      // Only an owner can erase (the RPC checks it). A lone non-owner member of
      // an ownerless workspace just leaves; the workspace itself is untouched.
      (callerOwns ? plan.erase : plan.leave).push(org);
    } else if (callerOwns && !others.some((m) => m.role === "owner")) {
      plan.blocked.push(org);
    } else {
      plan.leave.push(org);
    }
  }
  return plan;
}
