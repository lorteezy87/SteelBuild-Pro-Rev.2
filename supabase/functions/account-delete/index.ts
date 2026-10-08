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
//   Account identities are preserved for EVERY member, including the caller and
//   users left with no workspace. Workspace ownership never authorizes deleting
//   another person's login. A successful response reports users_deleted: 0.
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
import { CORS, json, handleOrgDeletion, handleAccountDeletion } from "./handlers.ts";
import { mfaDenialForVerifiedUser } from "../_shared/mfa.ts";

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
  const mfaDenial = mfaDenialForVerifiedUser(userData.user!, authHeader, req);
  if (mfaDenial) return mfaDenial;

  return mode === "account"
    ? await handleAccountDeletion(admin, userClient, callerId)
    : await handleOrgDeletion(admin, userClient, callerId, orgId as string);
});
