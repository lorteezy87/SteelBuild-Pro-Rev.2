# Security Matrix — Enterprise Readiness Phase 1

**Date:** 2026-05-25
**Scope:** RLS posture for every `public` table, Edge Function authorization, and client-side permission trust.
**Production project:** `kjrwqagyeswwoxpjkcko` (SteelBuild-Pro)
**Method:** Live Supabase security advisors, direct `pg_policies` / `pg_proc` inspection, edge-function source review, client-code audit. All checks read-only.

---

## 1. Headline posture

The security model is **server-authoritative and broadly sound**:

- **All 84 `public` tables have RLS enabled.** No table slipped through.
- Project isolation runs through SECURITY DEFINER helpers (`user_has_project_access`, `get_my_project_role`) that are clean `EXISTS` checks against `user_projects` with `SET search_path = public`. They **fail closed**.
- Per-project role is resolved server-side via the `get_my_project_role` RPC; `FeatureFlagsAdmin` and `ProjectMembers` writes are enforced by RLS, not just UI gates.
- Audit logging (`auditLogger`) keys off the Supabase session, not spoofable client state.

The remaining gaps are **policy hygiene, function grants, auth configuration, and a few proxy authorization checks** — not missing RLS. None are confirmed to be exposing data today; most are latent (fail-open patterns, or resources currently empty).

**Risk rating legend:** 🔴 High · 🟠 Medium · 🟡 Low · 🟢 Verified-correct

---

## 2. RLS table matrix

| Class | Tables | RLS | Isolation policy | Notes |
|---|---|---|---|---|
| Project-owned (membership) | rfis, drawings, drawing_sets, submittals, change_orders, change_requests, work_packages, schedule_tasks, expenses, sov_items, cost_codes, deliveries, delivery_items, scope_items, documents, document_folders, daily_logs, meetings, action_items, inspections, photos, punchlist_items, quality_control_records, safety_incidents, production_notes, warranties, resources, look_ahead, alerts, budget_hour_items, risks, mitigation_logs, mitigation_actions, project_closeout, pma_*, drawing_* activity/analysis tables, number_sequences, contacts, vendors | ✅ all | `project_member_access` + per-cmd policies via `user_has_project_access(project_id)` | 🟠 ~35 carry a `project_id IS NULL` escape hatch — see F-1 |
| Identity / RBAC | user_profiles, user_projects, projects, member_activity | ✅ | membership / admin helpers | 🟢 |
| Admin-only | feature_flags | ✅ | admin-only `WITH CHECK`/`USING` (migration 082) | 🟢 enforced server-side |
| Integration (token-bearing) | bluebeam_connections, bluebeam_sessions, bluebeam_session_documents, bluebeam_oauth_states, email_accounts, email_messages, email_attachments, external_file_refs, external_linked_folders, linked_folders | ✅ | service-role via edge functions | 🟠 see F-4 / F-5 |
| Telemetry / audit | llm_telemetry, ai_audit_log, pma_audit_logs, activities, drawing_activity, submittal_activity | ✅ | membership / insert-only | 🟢 |

`bluebeam_oauth_states` has RLS enabled with **no policy** (advisor `rls_enabled_no_policy`) — this is **correct**: it is touched only by the edge function via the service role, so deny-all-to-clients is the desired posture.

---

## 3. Findings, ranked

### 🟠 F-1 — `project_id IS NULL` RLS escape hatch (≈35 tables)
The `project_member_access` policy (cmd=`ALL`, permissive) on ~35 project-owned tables resolves to:
```
((project_id IS NULL) OR EXISTS(SELECT 1 FROM user_projects
   WHERE user_id = auth.uid() AND project_id = <table>.project_id))
```
Because PostgreSQL **OR's permissive policies**, any row with `project_id IS NULL` is **readable and writable (incl. INSERT via `WITH CHECK`) by every authenticated user** — and, given F-3, by anonymous users.
**Live exposure:** none today — a row-count across all affected tables returned **0 null-`project_id` rows**. The risk is (a) any future bug/import that creates a null-project row leaks cross-tenant instantly, and (b) any authenticated user can *create* such a row.
**Affected:** action_items, alerts, budget_hour_items, change_orders, change_requests, contacts, cost_codes, daily_logs, deliveries, documents, drawing_activity, expenses, inspections, look_ahead, meetings, mitigation_actions, mitigation_logs, number_sequences, photos, pma_assumptions, pma_audit_logs, pma_decisions, production_notes, project_closeout, punchlist_items, quality_control_records, resources, rfis, risks, safety_incidents, schedule_tasks, scope_items, sov_items, warranties, work_packages.
**Fix:** drop the `project_id IS NULL OR` disjunct (or change to `project_id IS NOT NULL AND <membership>`). One migration, regenerating `project_member_access` for the affected tables. Add a `CHECK (project_id IS NOT NULL)` where the column is meant to be mandatory.

### 🟠 F-2 — Trigger/definer functions carry `EXECUTE` grants to `anon` / `authenticated`
Advisors flag `seed_default_setup_items()` and `seed_project_cost_codes()` as `SECURITY DEFINER` executable by **`anon`** via `/rest/v1/rpc/...`, plus 26 functions executable by `authenticated`. Both seed functions are `RETURNS trigger` (fire on `projects` INSERT) and reference `NEW` — calling them directly via RPC **errors** (no trigger context), so practical exploitability is **low**. The real issues:
- `seed_default_setup_items` is SECURITY DEFINER **without `SET search_path`** (`function_search_path_mutable`) — the search-path-injection vector the CLAUDE.md contract explicitly forbids.
- Trigger and enforcement functions (`audit_log_trigger`, `enforce_drawing_set_unlock_role`, `enforce_user_projects_membership_identity`, etc.) should not be REST-callable at all.
**Fix:** `REVOKE EXECUTE ... FROM anon, authenticated` on all trigger/enforcement functions; `ALTER FUNCTION seed_default_setup_items() SET search_path = public`. Keep `EXECUTE` for the intended RPC helpers (`get_my_project_role`, `user_has_project_access`, `create_project`, `delete_drawing_set`).

### 🟠 F-3 — Anonymous sign-ins enabled
Auth config allows anonymous sign-ins (advisor flags it across 86 policies). Anonymous users receive the `authenticated` role and a real `auth.uid()`, so they pass any check that only distinguishes authenticated-vs-not. They are *not* members of any project (so membership policies deny them), but they **can reach the F-1 null-project rows** and any `authenticated`-granted RPC.
**Fix:** disable anonymous sign-ins in Supabase Auth settings unless a feature requires them (none found in the client). Independent of F-1, but they compound.

### 🟠 F-4 — sharepoint-proxy `sync_folder` IDOR (cross-project)
`supabase/functions/sharepoint-proxy/index.ts:353-362`. Membership is checked against the **client-supplied `projectId`** (line ~291), but the `linked_folders` lookup is `.eq("id", folderId)` with **no `.eq("project_id", projectId)`**. A member of project A can pass a `folderId` belonging to project B; the service-role client loads B's folder config and syncs/stages it. Mitigated only by `folderId` being an unguessable UUID — authorization should not rely on unguessability.
**Fix:** scope the lookup to the validated project (`.eq("project_id", projectId)`), or resolve the folder's owning project and check membership against *that*.

### 🟠 F-5 — bluebeam-proxy session actions skip membership
`supabase/functions/bluebeam-proxy/index.ts:414-417, 583-597`. The membership gate fires only when `body.projectId` is present. Session actions (`get_session`, `end_session`, `invite_user`, `list_session_files`, `create_snapshot`) key off `sessionId` with no `projectId`, so the gate is skipped. `end_session` mutates `bluebeam_sessions` by `.eq("session_id", sessionId)` alone. The external Bluebeam API calls are still gated by the caller's own Bluebeam token, but **our DB session record can be tampered cross-project**. Latent (table currently empty).
**Fix:** resolve the owning project from `bluebeam_sessions.project_id` for session-scoped actions and check membership before acting.

### 🟠 F-6 — email-send: membership checked, role not
`supabase/functions/email-send/index.ts:481`. Outbound send verifies project membership but **not role**, so a `viewer` can send email from the project's configured `from_email` and write `email_messages`. Per the RBAC contract, outbound/mutating actions should require pm/admin.
**Fix:** add `user_has_project_role_at_least(projectId, 'pm')` before send.

### 🟡 F-7 — email-ingest: single global webhook secret
`supabase/functions/email-ingest/index.ts:66-83`. Inbound webhook authenticates with one shared `EMAIL_WEBHOOK_SECRET` and validates the target project exists/active, but the secret is **not bound to a project**. A leaked secret grants org-wide write reach into any project's intake. Acceptable for a trusted server-to-server path, but it's a single high-value credential — rotate regularly and consider per-source scoping.

### 🟡 F-8 — Client localStorage role in the resolution chain (UI-only impact)
`src/components/shared/useAppSecurity.jsx:88-103, 177-180`. Role resolution is global-admin → per-project DB role → **localStorage `sbp_app_roles`** → default `pm`. An attacker editing localStorage to `{"me":"admin"}` on a screen with no active project resolves `isAdmin = true`. **Impact is UI-only** — every mutation still goes through RLS, which rejects the unauthorized action (42501). Still, localStorage is treated as a *source of truth* in the chain, the exact anti-pattern `permissions.js` was meant to remove.
**Fix:** drop the localStorage tier from role resolution / `isAdmin`; fall back to `viewer`, not `pm`.

### 🟡 F-9 — `RoleManager` writes roles to localStorage only
`src/components/settings/RoleManager.jsx:38,61,71`. Its "role assignments" mutate only `sbp_app_roles` (per-browser, self-spoofable, no DB effect). Misleading governance UI — an admin could believe they demoted someone who remains privileged at the DB. Real role management is the DB-backed `ProjectMembers` page.
**Fix:** remove or rewire `RoleManager` to the `user_projects` RPC path.

### 🟡 F-10 — Minor hygiene
- `pg_trgm` extension installed in `public` schema (`extension_in_public`) — move to an `extensions` schema.
- Leaked-password protection disabled (`auth_leaked_password_protection`) — enable HaveIBeenPwned check in Auth settings.
- `AdminRoute.jsx:5` destructures `loading` from `useAuth()` but the context exposes `isLoadingAuth`; the "Checking permissions…" branch never renders. Cosmetic (the deny still fires).

---

## 4. What is correctly enforced (do not over-flag)

- 🟢 All 84 tables RLS-enabled; helpers fail closed with fixed `search_path`.
- 🟢 `FeatureFlagsAdmin` writes enforced by admin-only RLS (migration 082) — the page's "RLS is permissive" comment is **stale**.
- 🟢 `ProjectMembers` writes go through `user_projects` RLS + DB-logged `member_activity`.
- 🟢 Broad unscoped `.list()` calls (CommandCenter, ExecutiveView, reports) rely on RLS for isolation — acceptable given full table coverage.
- 🟢 User-supplied `project_id` in query filters is convenience only; RLS is the real boundary on both read (`USING`) and write (`WITH CHECK`).
- 🟢 schedule-assistant routes all data access through an RLS-scoped client; llm-proxy does its own JWT verification (correct for `--no-verify-jwt`).

---

## 5. Remediation plan (proposed order)

| # | Finding | Change | Production impact | Risk |
|---|---|---|---|---|
| 1 | F-3 | Disable anonymous sign-ins (Auth setting) | Config toggle | None if unused |
| 2 | F-2 | `SET search_path` on seed fn; revoke EXECUTE on trigger/enforcer fns | Migration (grants) | Low |
| 3 | F-1 | Regenerate `project_member_access` without the null disjunct (~35 tables) | Migration (DDL) | Low–medium — test member access after |
| 4 | F-4 / F-5 | Scope proxy lookups to the owning project | Edge fn deploy | Low |
| 5 | F-6 | Role gate on email-send | Edge fn deploy | Low |
| 6 | F-8 / F-9 | Remove localStorage role tier; retire RoleManager | Client | Low |
| 7 | F-10 | Extension move, leaked-password protection, AdminRoute fix | Mixed | Low |

Each migration should be one focused file in `supabase/migrations/`, applied via Supabase MCP and committed to match (per the CLAUDE.md migration contract), with `NOTIFY pgrst, 'reload schema';` where grants change.

---

## 6. Security tests to add (Phase 1 item 1, "prove security")

Targeted tests that assert the boundary, not the UI:
- **Project isolation:** member of A cannot SELECT/UPDATE/DELETE B's rfis/drawings/expenses (expect RLS denial).
- **Null-project denial:** once F-1 lands, inserting/selecting a `project_id IS NULL` row is denied.
- **Role gates:** viewer cannot delete, export, send email, or change member roles; pm/admin can.
- **Admin-only:** non-admin cannot write `feature_flags`; `AdminRoute` denies non-admins.
- **Proxy authorization:** sharepoint `sync_folder` / bluebeam `end_session` reject a `folderId`/`sessionId` from a non-member project.

---

## 7. Open items

- **Second Supabase project `bxpowsphvofllljfbvmo` (SteelBuild-Submittals, created 2026-05-24)** was **not** audited here. Confirm whether it is in production use; if so, run this same matrix against it. If it is a decommissioned experiment, remove its credentials.
- This matrix is a point-in-time snapshot (2026-05-25). Re-run `get_advisors(security)` after any DDL change.
