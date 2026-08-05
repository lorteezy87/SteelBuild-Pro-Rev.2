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
//    Guideline 5.1.1(v): any account-creating user must be able to self-delete):
//   1. Any workspace where the caller is the SOLE owner is erased in full
//      (reusing the org path above) — per product policy, a sole owner's
//      deletion takes the whole workspace with it.
//   2. The caller's auth.users row is deleted; FK cascades remove their
//      remaining memberships, their `user_profiles` PII, and `user_projects`;
//      authorship columns (created_by, author_id, …) are ON DELETE SET NULL.
//   3. Co-members of erased workspaces who now belong to NO org are removed too.
//
// Irreversible. Deploy WITH JWT verify.
//   supabase functions deploy account-delete --project-ref <ref>
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.47";

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
async function eraseOwnedOrg(
  admin: any,
  userClient: any,
  orgId: string,
): Promise<{ storageRemoved: number; memberIds: string[]; projectsDeleted: number }> {
  // Snapshot project + member ids BEFORE the DB rows are erased.
  const { data: projects } = await admin.from("projects").select("id").eq("org_id", orgId);
  const projectIds: string[] = (projects ?? []).map((p: { id: string }) => p.id);
  const { data: members } = await admin.from("organization_members").select("user_id").eq("org_id", orgId);
  const memberIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);

  // DB erasure via the caller-scoped RPC (self-verifies owner).
  const { error: rpcErr } = await userClient.rpc("hard_delete_organization", { p_org_id: orgId });
  if (rpcErr) throw new Error(`db_erasure_failed:${orgId}:${rpcErr.message}`);

  // Storage purge (best-effort; DB rows are already gone).
  let storageRemoved = 0;
  try {
    storageRemoved += await removeAll(admin, "app-files", orgId);
    for (const pid of projectIds) storageRemoved += await removeAll(admin, "email-attachments", pid);
  } catch (_) { /* best-effort; report what we managed */ }

  return { storageRemoved, memberIds, projectsDeleted: projectIds.length };
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
    erased = await eraseOwnedOrg(admin, userClient, orgId);
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
  // Enumerate the caller's memberships.
  const { data: memberships } = await admin
    .from("organization_members")
    .select("org_id, role")
    .eq("user_id", callerId);
  const rows: Array<{ org_id: string; role: string }> = memberships ?? [];

  // Identify workspaces where the caller is the SOLE owner (only one owner row).
  const soleOwnerOrgs: string[] = [];
  for (const m of rows) {
    if (m.role !== "owner") continue;
    const { count } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", m.org_id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) soleOwnerOrgs.push(m.org_id);
  }

  // Erase each sole-owned workspace in full (must happen while the caller's JWT
  // is still valid — i.e. before deleting the caller's auth user below).
  const affected = new Set<string>();
  let storageRemoved = 0;
  let orgsDeleted = 0;
  for (const orgId of soleOwnerOrgs) {
    let erased;
    try {
      erased = await eraseOwnedOrg(admin, userClient, orgId);
    } catch (e) {
      return json({ error: "account_deletion_failed", detail: String((e as Error)?.message ?? e) }, 400);
    }
    storageRemoved += erased.storageRemoved;
    for (const uid of erased.memberIds) affected.add(uid);
    orgsDeleted++;
  }

  // Delete the caller's auth user. FK cascades remove their remaining
  // memberships, `user_profiles` PII, and `user_projects`; authorship refs are
  // ON DELETE SET NULL.
  const { error: delErr } = await admin.auth.admin.deleteUser(callerId);
  if (delErr) return json({ error: "account_deletion_failed", detail: delErr.message }, 400);

  // Sweep co-members of erased workspaces who now belong to NO org (the caller
  // is already gone and is skipped).
  const coMembersDeleted = await deleteOrphanedUsers(admin, affected, callerId);

  return json({
    ok: true,
    mode: "account",
    orgs_deleted: orgsDeleted,
    storage_objects_removed: storageRemoved,
    users_deleted: coMembersDeleted + 1, // + the caller
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
