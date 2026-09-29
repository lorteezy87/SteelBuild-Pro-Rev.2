// ─────────────────────────────────────────────────────────────────────────────
// account-delete — Supabase Edge Function (H11: right-to-erasure / offboarding)
//
// Two modes, selected by the request body:
//
// A) { org_id }        — erase an ORGANIZATION and everything it owns:
//   1. DB rows      — via the SECURITY DEFINER RPC `hard_delete_organization`,
//                     called with the CALLER's JWT so the RPC's own
//                     org-owner check runs (defence in depth: we also verify
//                     ownership here before touching Storage).
//   2. Storage      — app-files under `<org_id>/…` and email-attachments under
//                     each `<project_id>/…` (service role).
//   3. auth.users   — members who, after erasure, belong to NO other org
//                     (service role, auth admin API).
//
// B) { mode: "account" } — the CALLER deletes THEIR OWN account (App Store
//    Guideline 5.1.1(v): any account-creating user must be able to self-delete).
//    Every workspace is planned first (plan.ts), before anything is destroyed:
//   1. If the caller is the only OWNER of a workspace that has other members,
//      nothing happens: the request is refused (409 SOLE_OWNER_WITH_MEMBERS,
//      naming the workspaces) until they make another member an owner. Deleting
//      one person's account never takes other people's workspace or logins.
//   2. Workspaces where the caller is the ONLY member are erased with the
//      account, in one database transaction: `erase_my_sole_member_workspaces`
//      archives their live projects (hard_delete_organization's ARCHIVE_FIRST
//      guard) and erases each org as in mode A. If any step fails, nothing is
//      archived or erased. Their Storage is purged afterwards.
//   3. The caller's auth.users row is deleted; FK cascades remove their
//      remaining memberships, their `user_profiles` PII, and `user_projects`.
//      Rows they created in workspaces that stay lose the author link, and
//      audit and sign-off rows keep their id (20260927160000). Anything else
//      that still references the account makes the delete fail (409
//      RECORDS_REFERENCE_ACCOUNT).
//
// Irreversible. Deploy WITH JWT verify, and only after migrations
// 20260927150000 and 20260927160000 are applied: mode B calls the RPC the
// second one adds, and erasing a workspace with projects needs the first.
//   supabase functions deploy account-delete --project-ref <ref>
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.47";
import {
  ACCOUNT_ERASURE_REASON,
  WORKSPACE_ERASURE_REASON,
  eraseOrgArgs,
  eraseSoleWorkspacesArgs,
  erasedWorkspaceIds,
  planAccountDeletion,
  type OrgRoster,
} from "./plan.ts";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// Recursively collect every object path under `prefix` in `bucket`.
async function listAllPaths(admin: any, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop() as string;
    const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    if (error || !data) continue;
    for (const entry of data) {
      const full = dir ? `${dir}/${entry.name}` : entry.name;
      // Supabase marks folders with a null id / no metadata.
      if (entry.id === null || entry.metadata == null) stack.push(full);
      else out.push(full);
    }
  }
  return out;
}

async function removeAll(admin: any, bucket: string, prefix: string): Promise<number> {
  const paths = await listAllPaths(admin, bucket, prefix);
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (!error) removed += batch.length;
  }
  return removed;
}

// Erase every auth user in `ids` who, after DB erasure, belongs to NO org.
// Returns how many were deleted. `skip` is already-handled (e.g. the caller).
async function deleteOrphanedUsers(admin: any, ids: Iterable<string>, skip?: string): Promise<number> {
  let deleted = 0;
  for (const uid of ids) {
    if (uid === skip) continue;
    const { count } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if ((count ?? 0) === 0) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (!error) deleted++;
    }
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
): Promise<{ storageRemoved: number; memberIds: string[]; projectsDeleted: number }> {
  // Snapshot project + member ids BEFORE the DB rows are erased.
  const { data: projects } = await admin.from("projects").select("id").eq("org_id", orgId);
  const projectIds: string[] = (projects ?? []).map((p: { id: string }) => p.id);
  const { data: members } = await admin.from("organization_members").select("user_id").eq("org_id", orgId);
  const memberIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);

  // DB erasure via the caller-scoped RPC (self-verifies owner).
  const { error: rpcErr } = await userClient.rpc("hard_delete_organization", eraseOrgArgs(orgId, reason));
  if (rpcErr) throw new Error(`db_erasure_failed:${orgId}:${rpcErr.message}`);

  const storageRemoved = await purgeWorkspaceStorage(admin, [orgId], projectIds);
  return { storageRemoved, memberIds, projectsDeleted: projectIds.length };
}

// Storage purge for erased workspaces: app-files under `<org_id>/…` and
// email-attachments under each `<project_id>/…`. Best-effort; the DB rows are
// already gone.
async function purgeWorkspaceStorage(admin: any, orgIds: string[], projectIds: string[]): Promise<number> {
  let removed = 0;
  try {
    for (const orgId of orgIds) removed += await removeAll(admin, "app-files", orgId);
    for (const pid of projectIds) removed += await removeAll(admin, "email-attachments", pid);
  } catch (_) { /* best-effort; report what we managed */ }
  return removed;
}

// Mode A — erase an organization. Caller must be the org OWNER.
async function handleOrgDeletion(admin: any, userClient: any, callerId: string, orgId: string): Promise<Response> {
  const { data: ownerRow } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (!ownerRow || ownerRow.role !== "owner") {
    return json({ error: "forbidden", detail: "Only the organization owner can delete the workspace." }, 403);
  }

  let erased;
  try {
    erased = await eraseOwnedOrg(admin, userClient, orgId, WORKSPACE_ERASURE_REASON);
  } catch (e) {
    return json({ error: "db_erasure_failed", detail: String((e as Error)?.message ?? e) }, 400);
  }

  const usersDeleted = await deleteOrphanedUsers(admin, erased.memberIds);
  return json({
    ok: true,
    org_id: orgId,
    projects_deleted: erased.projectsDeleted,
    storage_objects_removed: erased.storageRemoved,
    users_deleted: usersDeleted,
  });
}

// Mode B — the caller deletes their OWN account.
async function handleAccountDeletion(admin: any, userClient: any, callerId: string): Promise<Response> {
  // Every workspace the caller belongs to, with its full roster, so the plan is
  // made before anything is destroyed.
  const { data: memberships, error: membershipsErr } = await admin
    .from("organization_members")
    .select("org_id")
    .eq("user_id", callerId);
  if (membershipsErr) return json({ error: "account_deletion_failed", step: "plan", detail: membershipsErr.message }, 400);
  const orgIds: string[] = [...new Set<string>((memberships ?? []).map((m: { org_id: string }) => m.org_id))];

  const rosters: OrgRoster[] = [];
  for (const orgId of orgIds) {
    const [{ data: org }, { data: members, error: membersErr }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin.from("organization_members").select("user_id, role").eq("org_id", orgId),
    ]);
    if (membersErr) return json({ error: "account_deletion_failed", step: "plan", detail: membersErr.message }, 400);
    rosters.push({
      orgId,
      orgName: org?.name ?? "Unnamed workspace",
      members: (members ?? []).map((m: { user_id: string; role: string }) => ({ userId: m.user_id, role: m.role })),
    });
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
  const storageRemoved = await purgeWorkspaceStorage(admin, erased.orgIds, erased.projectIds);

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  let orgId: string | undefined;
  let mode: string | undefined;
  try {
    const body = await req.json();
    orgId = body?.org_id;
    mode = body?.mode;
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (mode !== "account" && !orgId) {
    return json({ error: "org_id is required" }, 400);
  }

  // Caller-scoped client (RLS + auth.uid() = caller) and service-role client.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Identify the caller before any destruction.
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (userErr || !callerId) return json({ error: "unauthorized" }, 401);

  return mode === "account"
    ? await handleAccountDeletion(admin, userClient, callerId)
    : await handleOrgDeletion(admin, userClient, callerId, orgId as string);
});
