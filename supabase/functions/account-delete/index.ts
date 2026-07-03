// ─────────────────────────────────────────────────────────────────────────────
// account-delete — Supabase Edge Function (H11: right-to-erasure / offboarding)
//
// Permanently erases an ORGANIZATION and everything it owns:
//   1. DB rows      — via the SECURITY DEFINER RPC `hard_delete_organization`,
//                     called with the CALLER's JWT so the RPC's own
//                     org-owner check runs (defence in depth: we also verify
//                     ownership here before touching Storage).
//   2. Storage      — app-files under `<org_id>/…` and email-attachments under
//                     each `<project_id>/…` (service role).
//   3. auth.users   — members who, after erasure, belong to NO other org
//                     (service role, auth admin API).
//
// Irreversible. Guarded: caller must be the org OWNER. Deploy WITH JWT verify.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  let orgId: string;
  try {
    const body = await req.json();
    orgId = body?.org_id;
    if (!orgId) return json({ error: "org_id is required" }, 400);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  // Caller-scoped client (RLS + auth.uid() = caller) and service-role client.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Identify the caller and verify OWNER before any destruction.
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  const callerId = userData?.user?.id;
  if (userErr || !callerId) return json({ error: "unauthorized" }, 401);

  const { data: ownerRow } = await admin
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", callerId)
    .maybeSingle();
  if (!ownerRow || ownerRow.role !== "owner") {
    return json({ error: "forbidden", detail: "Only the organization owner can delete the workspace." }, 403);
  }

  // Snapshot project ids + member ids BEFORE the DB rows are erased.
  const { data: projects } = await admin.from("projects").select("id").eq("org_id", orgId);
  const projectIds: string[] = (projects ?? []).map((p: { id: string }) => p.id);
  const { data: members } = await admin.from("organization_members").select("user_id").eq("org_id", orgId);
  const memberIds: string[] = (members ?? []).map((m: { user_id: string }) => m.user_id);

  // 1) DB erasure via the caller-scoped RPC (self-verifies owner).
  const { error: rpcErr } = await userClient.rpc("hard_delete_organization", { p_org_id: orgId });
  if (rpcErr) return json({ error: "db_erasure_failed", detail: rpcErr.message }, 400);

  // 2) Storage purge (best-effort; DB rows are already gone).
  let storageRemoved = 0;
  try {
    storageRemoved += await removeAll(admin, "app-files", orgId);
    for (const pid of projectIds) {
      storageRemoved += await removeAll(admin, "email-attachments", pid);
    }
  } catch (_) { /* best-effort; report what we managed */ }

  // 3) Delete auth users who now belong to NO org (true erasure of the person).
  let usersDeleted = 0;
  for (const uid of memberIds) {
    const { count } = await admin
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if ((count ?? 0) === 0) {
      const { error } = await admin.auth.admin.deleteUser(uid);
      if (!error) usersDeleted++;
    }
  }

  return json({
    ok: true,
    org_id: orgId,
    projects_deleted: projectIds.length,
    storage_objects_removed: storageRemoved,
    users_deleted: usersDeleted,
  });
});
