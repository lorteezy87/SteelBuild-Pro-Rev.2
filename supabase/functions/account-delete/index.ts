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
// The erasure logic lives in erasure.ts and FAILS CLOSED: any read that decides
// what to erase must succeed before anything is destroyed.
//
// Irreversible. Deploy WITH JWT verify.
//   supabase functions deploy account-delete --project-ref <ref>
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// ─────────────────────────────────────────────────────────────────────────────

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.47";
import { handleAccountDeletion, handleOrgDeletion } from "./erasure.ts";

// supabase-js's functions.invoke() always sends X-Client-Info, and Sentry adds
// sentry-trace/baggage to traced requests. A preflight that does not allow a
// header the browser is about to send fails outright, so with the old
// "authorization, apikey, content-type" list every Delete-my-account and
// Delete-workspace call died in the browser before reaching this function.
// Keep in step with ALLOW_HEADERS in ../_shared/cors.ts.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-auth, sentry-trace, baggage",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
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

  const result = mode === "account"
    ? await handleAccountDeletion(admin, userClient, callerId)
    : await handleOrgDeletion(admin, userClient, callerId, orgId as string);
  return json(result.body, result.status);
});
