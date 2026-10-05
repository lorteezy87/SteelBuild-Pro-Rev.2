import {
  ACCOUNT_ERASURE_REASON,
  WORKSPACE_ERASURE_REASON,
  eraseOrgArgs,
  eraseSoleWorkspacesArgs,
  erasedWorkspaceIds,
  planAccountDeletion,
  type OrgRoster,
} from "./plan.ts";
import { purgeWorkspaceStorage, StoragePurgeError } from "./storage.ts";
import { CleanupReadError, readScopedRows, recoverErasedWorkspaceScopes } from "./cleanup.ts";

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Database rows have already been erased when Storage is reached. Report the
// incomplete cleanup and keep Auth users. An account retry recovers the erased
// scopes from data_erasure_log before attempting Auth deletion again.
function storageFailure(error: StoragePurgeError): Response {
  console.error(error.message);
  return json({
    error: "STORAGE_ERASURE_FAILED",
    step: "storage",
    detail: "Workspace records were erased, but file cleanup did not finish. Account sign-ins were kept. Retry account deletion to finish file cleanup, or contact support@steelbuild-pro.com.",
    storage_bucket: error.bucket,
    storage_prefix: error.prefix,
  }, 503);
}

function cleanupFailure(error: unknown): Response {
  console.error(error);
  return json({
    error: "ACCOUNT_CLEANUP_INCOMPLETE",
    step: "cleanup",
    detail: "Cleanup could not be verified. Account deletion was not completed. Retry or contact support@steelbuild-pro.com.",
  }, 503);
}

// Verify every membership count before deleting any orphaned Auth users.
// A null count or failed read is unknown, never proof of zero memberships.
async function deleteOrphanedUsers(admin: any, ids: Iterable<string>, skip?: string): Promise<number> {
  const orphaned: string[] = [];
  for (const uid of new Set(ids)) {
    if (uid === skip) continue;
    const { count, error } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if (error || !Number.isSafeInteger(count) || count < 0) {
      throw new CleanupReadError("Cannot verify remaining account memberships");
    }
    if (count === 0) orphaned.push(uid);
  }
  let deleted = 0;
  for (const uid of orphaned) {
    const { error } = await admin.auth.admin.deleteUser(uid);
    if (error) throw new CleanupReadError("Orphaned account deletion failed");
    deleted++;
  }
  return deleted;
}

// Erase one organization the caller OWNS: DB rows (caller-scoped RPC, which
// self-verifies owner) + Storage (service role). Returns storage objects removed
// and the org's member ids (so the caller can sweep now-orphaned auth users).
// `reason` is required by the RPC (see plan.ts).
async function eraseOwnedOrg(
  admin: any,
  userClient: any,
  orgId: string,
  reason: string,
  callerId: string,
): Promise<{ storageRemoved: number; memberIds: string[]; projectsDeleted: number }> {
  // Snapshot project + member ids BEFORE the DB rows are erased.
  const projects = await readScopedRows(admin, "projects", "id", { org_id: orgId });
  const projectIds = projects.map(project => project.id as string);
  const members = await readScopedRows(admin, "organization_members", "user_id", { org_id: orgId }, "user_id");
  const memberIds = members.map(member => member.user_id as string);

  // DB erasure via the caller-scoped RPC (self-verifies owner).
  const { error: rpcErr } = await userClient.rpc("hard_delete_organization", eraseOrgArgs(orgId, reason));
  if (rpcErr) throw new Error(`db_erasure_failed:${orgId}:${rpcErr.message}`);

  // The journal also captures projects added after our pre-erasure snapshot.
  const scopes = await recoverErasedWorkspaceScopes(admin, callerId, { orgIds: [orgId], projectIds }, orgId);
  const storageRemoved = await purgeWorkspaceStorage(admin, scopes.orgIds, scopes.projectIds);
  return { storageRemoved, memberIds, projectsDeleted: scopes.projectIds.length };
}

// Mode A — erase an organization. Caller must be the org OWNER.
export async function handleOrgDeletion(admin: any, userClient: any, callerId: string, orgId: string): Promise<Response> {
  const { data: ownerRow, error: ownerError } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (ownerError) return cleanupFailure(ownerError);
  if (!ownerRow || ownerRow.role !== "owner") {
    return json({ error: "forbidden", detail: "Only the organization owner can delete the workspace." }, 403);
  }

  let erased;
  try {
    erased = await eraseOwnedOrg(admin, userClient, orgId, WORKSPACE_ERASURE_REASON, callerId);
  } catch (e) {
    if (e instanceof StoragePurgeError) return storageFailure(e);
    if (e instanceof CleanupReadError) return cleanupFailure(e);
    return json({ error: "db_erasure_failed", detail: String((e as Error)?.message ?? e) }, 400);
  }

  let usersDeleted: number;
  try {
    usersDeleted = await deleteOrphanedUsers(admin, erased.memberIds);
  } catch (error) {
    return cleanupFailure(error);
  }
  return json({
    ok: true,
    org_id: orgId,
    projects_deleted: erased.projectsDeleted,
    storage_objects_removed: erased.storageRemoved,
    users_deleted: usersDeleted,
  });
}

// Mode B — the caller deletes their OWN account.
export async function handleAccountDeletion(admin: any, userClient: any, callerId: string): Promise<Response> {
  // Every workspace the caller belongs to, with its full roster, so the plan is
  // made before anything is destroyed.
  const rosters: OrgRoster[] = [];
  try {
    const memberships = await readScopedRows(admin, "organization_members", "org_id", { user_id: callerId }, "org_id");
    for (const membership of memberships) {
      const orgId = membership.org_id as string;
      const [{ data: org, error: orgError }, members] = await Promise.all([
        admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
        readScopedRows(admin, "organization_members", "user_id,role", { org_id: orgId }, "user_id"),
      ]);
      if (orgError || !org || members.length === 0 || members.some(member => typeof member.role !== "string")) {
        throw new CleanupReadError("Cannot verify workspace membership roster");
      }
      rosters.push({
        orgId,
        orgName: org.name ?? "Unnamed workspace",
        members: members.map(member => ({ userId: member.user_id as string, role: member.role as string })),
      });
    }
  } catch (error) {
    return cleanupFailure(error);
  }

  const plan = planAccountDeletion(callerId, rosters);
  if (plan.blocked.length > 0) {
    return json({
      error: "SOLE_OWNER_WITH_MEMBERS",
      workspaces: plan.blocked.map((o) => o.orgName),
      detail: "Make another member an owner of these workspaces, then delete your account.",
    }, 409);
  }

  // Erase every workspace where the caller is the only member, in one
  // database transaction: the RPC archives their live projects (the
  // ARCHIVE_FIRST step hard_delete_organization requires) and erases each org,
  // so a failure leaves nothing half-archived. It picks the workspaces itself,
  // by the same rule as plan.erase, and runs with the caller's JWT, so it has
  // to happen before their auth user is deleted below.
  const { data: erasedBody, error: eraseErr } = await userClient.rpc(
    "erase_my_sole_member_workspaces",
    eraseSoleWorkspacesArgs(ACCOUNT_ERASURE_REASON),
  );
  if (eraseErr) return json({ error: "account_deletion_failed", step: "erase", detail: eraseErr.message }, 400);
  const erased = erasedWorkspaceIds(erasedBody);
  let storageRemoved: number;
  try {
    // Always recover earlier attempts too: the RPC returns empty IDs once its
    // database transaction has committed, even if Storage cleanup then failed.
    const scopes = await recoverErasedWorkspaceScopes(admin, callerId, erased);
    storageRemoved = await purgeWorkspaceStorage(admin, scopes.orgIds, scopes.projectIds);
  } catch (error) {
    if (error instanceof StoragePurgeError) return storageFailure(error);
    return cleanupFailure(error);
  }

  // Delete the caller's auth user. FK cascades remove their remaining
  // memberships, `user_profiles` PII, and `user_projects`, and release their
  // authorship of rows in the workspaces that stay (20260927160000).
  const { error: delErr } = await admin.auth.admin.deleteUser(callerId);
  if (delErr) {
    // A foreign key to auth.users that still has no ON DELETE rule (one not
    // covered by 20260927160000) blocks the delete.
    const blockedByRecords = /database error deleting user/i.test(delErr.message);
    return json(blockedByRecords
      ? {
          error: "RECORDS_REFERENCE_ACCOUNT",
          detail: "Records you created in a shared workspace still reference your account, so it couldn't be removed. Contact support@steelbuild-pro.com and we'll complete the deletion.",
        }
      : { error: "account_deletion_failed", step: "delete_user", detail: delErr.message },
    blockedByRecords ? 409 : 400);
  }

  return json({
    ok: true,
    mode: "account",
    orgs_deleted: erased.orgIds.length,
    storage_objects_removed: storageRemoved,
    users_deleted: 1,
  });
}
