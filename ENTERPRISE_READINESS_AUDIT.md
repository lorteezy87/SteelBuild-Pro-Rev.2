# SteelBuild Pro — Enterprise Readiness Audit

**Scope:** Full top-to-bottom audit — frontend, edge/backend, database & RLS, CI/CD, security, auth, performance & scale, reliability/DR, observability, testing, accessibility, compliance/privacy, and buyer due-diligence dimensions.
**Audited tree:** fresh `origin/main` worktree at commit **`642ce154`** (production HEAD), *not* the local checkout (which was 79 commits behind — auditing the stale tree would have produced false positives, per prior lessons).
**Method:** 11 parallel domain auditors → an adversarial verification pass on every critical/high/medium finding (a second agent tried to *refute* each) → a completeness critic for gaps the 11 domains missed. 99 agents total. Findings that failed verification were dropped. Layered on top: live Supabase probes (advisors, `pg_policies`, `pg_cron`, `pg_trigger`), `npm audit`, and git-history inspection I ran directly.
**Stack (corrected):** Vite + React 18 SPA (react-router-dom), React Query, mixed JS/TS, Supabase (Postgres 17 + RLS + Auth + Storage + Deno Edge Functions), Stripe billing, Vercel hosting, Sentry. **Not Next.js** — Next-specific concerns do not apply and were re-mapped to the equivalents that do (client-bundle secret exposure, RLS as the true authz boundary, React Query cache-coherence).

---

## 1. Executive Summary

**Bottom line:** The *product core* is in good shape and its crown-jewel boundaries are genuinely sound — **there are zero critical findings and the tenant-isolation, money-math, and fab-release-gate layers hold up under live testing.** What is *not* yet enterprise-ready is the **operational, governance, and compliance wrapper** an enterprise buyer's security team and procurement will grade you on: no staging environment, database migrations applied by hand straight to production, no backup/DR posture for the drawing files that *are* the business, no password-reset or MFA, no data-erasure path (while your live Privacy Policy promises one), draft legal pages already in production, and a systemic accessibility gap. These are the gaps that fail a SOC 2 audit, a security questionnaire, or a pen test — not the application logic.

**The numbers:** 133 verified findings — **0 Critical, 27 High, 54 Medium, 52 Low.** All 27 Highs survived adversarial verification (CONFIRMED). No High is a data-*breach* today; the Highs are concentrated in **operational safety (CI/CD, DR, backups), account security (password reset, MFA), compliance (erasure, legal, tax, DPA), and accessibility.**

**Live-verified strengths (do not over-react to the finding count):**
- **103/103 public tables have RLS enabled** (I confirmed against prod). Tenant isolation funnels through one auditable helper, `user_has_project_access`, cascading to ~70 project-scoped tables.
- The **`projects` cross-tenant hijack** found in the 2026-06-29 review is **fixed and live** — I confirmed `trg_enforce_project_update_guard` exists on prod.
- The **`activities` audit trail is now append-only on prod** (INSERT + SELECT only — I confirmed via `pg_policies`).
- All 47 `SECURITY DEFINER` functions set `search_path`; billing secrets are deny-all service-role-only; money math is integer-cents throughout.
- **`npm audit`: 0 vulnerabilities** across 932 dependencies.

**The five things to fix first (highest risk-to-effort ratio):**
1. **Backups & DR for Storage (H24, H25).** Drawing PDFs — the crown jewels — have **zero backup or replication**; Supabase DB backups do not cover Storage. A bucket-level accident or region event is unrecoverable. Enable PITR, script a bucket export, document RTO/RPO, and run one restore test.
2. **Viewer-role write access to ~25 business tables (H1).** The read-only `viewer` role can `INSERT/UPDATE/DELETE` documents, uploaded-file metadata, change requests, QC records, transmittals, and the authoritative `drawing_revisions` register. One migration (the pattern already exists — it was applied to 5 tables) closes it.
3. **Account security (H22, H23).** No password-reset/change flow and no MFA. Users can't rotate a leaked credential, and every enterprise questionnaire asks for MFA on day one.
4. **Compliance quadfecta (H11–H14).** Erasure is unimplementable while promised; legal pages are DRAFT in prod with no clickwrap; no DPA and the subprocessor list omits the LLM providers that receive customer data; live Stripe collects no AZ sales tax (TPT liability accruing).
5. **CI/CD safety net (H3–H6).** No staging, DB migrations bypass the pipeline with no drift detection or rollback, edge functions deploy by hand, and `main` has no branch protection while ~10 agents push to it (which also means the `VERCEL_TOKEN` in the workflow is exfiltratable by anyone who can push a workflow edit).

**How to read the rest:** Section 2 is the full findings by category (all 133, each with an inline fix and, for 115 of them, ready-to-apply code). Section 3 is the prioritized remediation plan in waves. Section 4 highlights the top ready-to-commit patches. Section 5 is your manual-action checklist (the 50 items that need a human — dashboard toggles, legal docs, vendor contracts).

---

## Severity Counts

| Severity | Count | Verification |
|----------|-------|--------------|
| 🔴 Critical | 0 | — |
| 🟠 High | 27 | all CONFIRMED |
| 🟡 Medium | 54 | verified |
| ⚪ Low | 52 | filed |
| **Total** | **133** | |

**By domain:**

| Domain | High | Med | Low |
|---|---|---|---|
| Database security & RLS | 1 | 3 | 4 |
| Edge functions | 1 | 4 | 8 |
| CI/CD & deployment | 4 | 5 | 3 |
| Observability & error handling | 2 | 4 | 3 |
| Performance & scalability | 2 | 3 | 5 |
| Compliance & privacy | 4 | 4 | 4 |
| Accessibility | 3 | 5 | 2 |
| Testing & quality gates | 2 | 3 | 4 |
| Frontend architecture & tech debt | 2 | 6 | 4 |
| Auth & session security | 2 | 6 | 7 |
| Reliability & DR | 4 | 7 | 6 |
| Due-diligence gaps (critic) | 0 | 4 | 2 |

---

## 3. Prioritized Mitigation Plan

Findings are ID'd `H#/M#/L#` (per-severity, matching Section 2). Waves are ordered by risk-reduction per unit effort, not strictly by severity.

### Wave 0 — Stop-the-bleed (this week, mostly config/manual)
- **H25 / H24 / M?** Enable Supabase **PITR**; write a nightly **Storage bucket export** to a second bucket/region; document RTO/RPO. *(Storage has no backup today — highest single risk.)*
- **H1** Ship the **viewer-role RLS floor** migration (extend the existing i2 pattern to the ~25 remaining tables; `pm` floor for doc-control/financial). One migration, verify against a real viewer account.
- **H14** Turn on **Stripe Tax** / add AZ TPT line — liability accrues from the first dollar. *(Manual + billing code.)*
- **H12** Either take the DRAFT legal pages **down** or get them reviewed and add **signup clickwrap**. *(Manual/legal.)*
- **L18 / L47 / infra** Delete the **`stripe-sync-worker` cron** (jobid 4, fires every 60s → orphan `stripe-worker`) and **`functions delete`** the 5 orphan/deprecated edge functions (`stripe-setup`, `stripe-webhook`, `stripe-worker`, `sharepoint-proxy`, `bluebeam-proxy`). *(I confirmed all 5 still ACTIVE and the cron live.)*

### Wave 1 — Account security & backups completeness (1–2 weeks)
- **H22** Password reset + change-password flow (Supabase `resetPasswordForEmail` + an update-password page).
- **H23** MFA (TOTP) enrollment UI + enforcement option; document the roadmap for org-level enforcement.
- **H26 / H2 / M20 / M47** Fix **`project-export` truncation** (paginate past the 1000-row PostgREST cap) and **expand coverage** from 15 → all ~100 project tables + Storage files, so the "workspace backup" and GDPR export actually deliver.
- **H11** Implement an **erasure/account-deletion path** (org + auth user + storage) or correct the Privacy Policy to match reality.
- **M40 / auth** Flip **CSP from Report-Only to enforcing** (tokens live in localStorage — XSS blast radius).

### Wave 2 — CI/CD & operational safety (2–4 weeks)
- **H3** Stand up a **staging** Supabase project + Vercel preview env; stop testing in prod.
- **H4** Bring **DB migrations into the pipeline** (supabase CLI `db push` against staging then prod; add drift detection).
- **H5 / M46** Bring **edge-function deploys into CI** with drift detection.
- **H6 / M12** **Branch protection** on `main` (or a review gate); scope/rotate `VERCEL_TOKEN`; add a least-privilege `permissions:` block; pin actions to SHAs.
- **M8 / M9** Add a **concurrency guard** on the deploy job and **git-SHA + Sentry release** tagging.

### Wave 3 — Observability & monitoring (2–4 weeks, parallelizable)
- **H7** Add a **healthcheck endpoint + uptime monitor + status page.**
- **H8** Wire **Sentry release tagging + source-map upload** in CI (`SENTRY_AUTH_TOKEN`).
- **H21 / M16** Add a **React Query global error handler** (`QueryCache.onError`) so failed fetches surface to the user and Sentry instead of rendering empty.
- **H13 / M13** Add **error tracking/alerting for edge functions** (currently invisible except `llm_telemetry`).
- **M14 / M15** Bind audit attribution to `auth.uid()` (not free text); add Sentry `beforeSend` PII scrub + user/org context.

### Wave 4 — Accessibility (VPAT-blocking; 3–6 weeks)
- **H15** Programmatic labels (`htmlFor`/`aria-label`) — 4 `htmlFor` in the whole app today.
- **H16 / M26** Keyboard operability for clickable rows/tables (~181 instances) and Gantt drag.
- **H17 / M24** Fix **command_ui contrast** (chips at 1.7–2.7:1) and restore visible focus rings in the dark theme.
- **M25 / M27 / M28** Dialog semantics/focus-trap on bespoke modals; name icon/close buttons; add `jsx-a11y` lint + axe tests; publish an accessibility statement.

### Wave 5 — Scale & performance (as data grows)
- **H9 / H10 / M18** Cap and paginate the uncapped cross-project fetches (CommandCenter/AIInsights `listAll`, portfolio/search 2k truncation); server-side pagination + the truncation-notice pattern on Submittals/RFIs/Hub.
- **Perf advisors** `(select auth.uid())` wrapping, consolidate duplicate permissive policies (M17), drop the 171 unused indexes (L23), add the missing FK index.
- **M19 / L20 / L21** Batch bulk mutations; debounce realtime invalidation; scope broad cache-invalidation prefixes.

### Wave 6 — Governance, compliance corpus & tech-debt paydown (ongoing)
- **M22 / M23 / L24** DPA, security-questionnaire pack, SOC 2 roadmap, IR/breach plan; enforce peer review (change-management evidence).
- **M21** Data-retention policy + purge automation (email bodies, telemetry, audit).
- **M32 / M37 / L33** Remove the **committed agent-worktree snapshot** (`.claude/worktrees/gifted-rhodes-7af818/`, ~26MB, 964 files) and junk artifacts; fix `.gitignore`.
- **M20 / M33–M36 / L36** Refresh docs (deploy model wrong in 3 of 4 docs; regenerate Supabase types to include org/billing).
- **H20 / M?** Retire the `command_ui` dual-render debt (~27 pages shipping two implementations with the flag globally on).
- **M52–M54 / L51** Support/SLA process, pen-test, `security.txt`, API versioning, license governance (SBOM/THIRD-PARTY-NOTICES).

---

---

## 2. Detailed Findings by Category

_All 133 findings, grouped by domain and sorted Critical→Low. Each carries an inline fix; 115 include ready-to-apply code. Line numbers reference the `origin/main` @ `642ce154` tree._

### Database security & RLS

Fix-status on the 2026-06-29 items: (a) activities append-only is FIXED — supabase/migrations/20260630040350_activities_append_only.sql:12-13 drops the project_update/project_delete policies the baseline creates (20260101000010_baseline_schema.sql:9469,10068), leaving INSERT+SELECT; (b) the projects UPDATE guard is PRESENT — 20260629184030_projects_update_guard.sql:13-48 makes org_id immutable and gates 5 contract fields at pm+, though its revoke at line 51 omits PUBLIC so the function stays advisor-flagged; (c) get_invitation is STILL-OPEN — anon-executable (baseline:10508) and returns invitee email/org/role (baseline:772-783), mitigated by a gen_random_uuid v4 token (baseline:4210) and the fact the only caller runs post-auth. Tenant isolation itself is in strong shape: all 102 public tables have RLS, the org boundary is centralized in user_has_project_access (baseline:2020-2039), billing_config/billing_events deny-all is intentional (service-role-only Stripe secrets ledger, zero client reads), and all 47 SECURITY DEFINER functions set search_path. The biggest enterprise gap is in-tenant RBAC: ~25 business tables (documents, uploaded_files, change_requests, quality_control_records, drawing_revisions — the authoritative revision register — transmittals, project_closeout, email settings, and the just-recreated project_handoff_items) still let the read-only 'viewer' role INSERT/UPDATE/DELETE, the exact defect the i2 migration fixed for only 5 tables. Secondary gaps: DB-level audit triggers cover only 11 tables (submittals, pay apps, drawings, projects, and membership changes rely on bypassable app-side logging), and app-files storage reads are org-scoped rather than project-scoped with a founding-org legacy path still pending backfill.

**Strengths:**
- Every one of the 102 public tables in the baseline has RLS enabled; the only two policy-less tables (billing_config, billing_events — baseline:8886,8889) are deliberate deny-all service-role-only Stripe state with zero client reads (supabase/functions/stripe-billing/index.ts:54,126), keeping the webhook signing secret and price ids out of client reach.
- Tenant isolation is centralized in one SECURITY DEFINER helper, user_has_project_access (20260101000010_baseline_schema.sql:2020-2039), joining projects→organization_members with an org owner/admin bypass and per-project user_projects membership — one auditable choke point that cascades to ~70 project-scoped tables (and 20260630060302 migrated the last non-canonical table onto it).
- All 47 SECURITY DEFINER functions in the baseline set an explicit search_path, and 60 functions carry REVOKE ALL FROM PUBLIC with explicit role grants (e.g. accept_invitation, baseline:10394-10396, correctly authenticated-only).
- Append-only audit ledgers done right: fab_release_log, backcharge_events, ai_audit_log, pma_audit_logs, member_activity are INSERT+SELECT only with actor identity bound to auth.uid() in WITH CHECK (baseline:9190, 8862, 8826, 9760, 9275), and activities joined them via 20260630040350.
- Defense-in-depth DB triggers on high-stakes writes: projects org_id immutability + contract-field pm+ floor (20260629184030), a RESTRICTIVE policy blocking 'Released for Fabrication' status below pm (baseline:10330), locked-drawing-set update guard (baseline:9157), the fab-release gate trigger, the schedule-task cycle guard, and a role-value allowlist inside the user_projects write policies (baseline:8815).
- Storage buckets are private with an explicit MIME allowlist and size caps (20260101000020_baseline_seed.sql:22-46); email-attachments reads are project-scoped via user_has_project_access (seed:68).
- The public demo-request funnel is well-contained: anon INSERT is column-scoped by grant and length-bounded by policy, reads are global-admin only, and the pg_net webhook reads its URL from Vault and swallows failures (20260623032908:23-44, 20260623042453:19-44).
- Membership administration is admin-gated with an explicit canonical role allowlist, and invitation acceptance enforces auth, email match, expiry, and plan seat limits inside one definer RPC (baseline:8811-8819, 26-79).


#### 🟠 H1 · Viewer role can write/delete ~25 business tables (role-floor gap the i2 migration only partially closed)
- **Severity:** high · **Effort:** M · CONFIRMED
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:9036`
- **Issue:** The baseline's write policies for a large set of business tables are gated only by user_has_project_access — true for ANY project member including the read-only 'viewer' role. Migration 20260620231716 (i2) fixed exactly this for 5 tables and 20260630040350 fixed activities, but the same defect remains on: documents, uploaded_files, warranties, scope_items, resources, quality_control_records, project_closeout, pma_decisions, pma_assumptions, number_sequences, mitigation_actions/logs, meetings, look_ahead, email_integration_settings, email_intake_queue, drawing_transmittals(+items), drawing_reviews, drawing_impacts, drawing_activity, change_requests, alerts (all INSERT/UPDATE/DELETE, e.g. supabase/migrations/20260101000010_baseline_schema.sql:9501 documents DELETE, 10220 uploaded_files UPDATE, 9481 change_requests DELETE, 10188 quality_control_records UPDATE), plus ALL-command policies on drawing_revisions (baseline:9036 — the AUTHORITATIVE current-revision register; a viewer can flip is_current or delete revision history), drawing_zone_activity/proposals, model_registry, model_element_links, linked_folders, external_file_refs/linked_folders, document_folders, document_import_queue, drawing_revision_comparisons — and project_handoff_items was re-created member-writable on 2026-06-30 (20260630060302_project_handoff_items_canonical_rls.sql:15-20). projects UPDATE itself is member-level (baseline:10180) with the trigger guarding only org_id + 5 contract columns, so a viewer can still rename a project or change status/dates.
- **Impact:** The core enterprise use case for 'viewer' is giving a GC, owner rep, or EOR read-only access. Today that account can silently corrupt or erase document registers, file metadata, QC records, change requests (PCO money), transmittal history, and the drawing revision authority for any project it can see — in-tenant, via a plain PostgREST call, with no UI needed. Any enterprise security review or pen test will find this within hours.
- **Fix:** Apply the established i2 pattern to every remaining membership-gated write policy: split into a member SELECT policy plus write policies floored at user_has_project_role_at_least(project_id,'field') (or 'pm' for doc-control/financial tables like drawing_revisions, change_requests, project_closeout, email_integration_settings). One migration, behavior-verified against a real viewer account like i2 was.

```
-- pattern (repeat per table; floor 'pm' where noted)
drop policy if exists project_insert on public.documents;
drop policy if exists project_update on public.documents;
drop policy if exists project_delete on public.documents;
create policy documents_write on public.documents for all to authenticated
  using      (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));
-- keep existing member-level SELECT policy unchanged

-- doc-control authority: floor at pm
drop policy if exists drawing_revisions_project_access on public.drawing_revisions;
create policy drawing_revisions_read on public.drawing_revisions for select to authenticated
  using (user_has_project_access(project_id));
create policy drawing_revisions_write on public.drawing_revisions for all to authenticated
  using      (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));
notify pgrst, 'reload schema';
```

#### 🟡 M1 · DB-level audit triggers cover only 11 tables; submittals, pay apps, drawings, projects, and membership changes rely on bypassable app-side logging
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:7190`
- **Issue:** audit_log_trigger() → pma_audit_logs fires on exactly 11 tables (supabase/migrations/20260101000010_baseline_schema.sql:7190-7230: change_orders, change_requests, deliveries, expenses, inspections, punchlist_items, rfis, safety_incidents, scope_items, sov_items, work_packages). The moat workflow's authority tables — submittals (status/ball_in_court transitions), drawings, drawing_sets, drawing_revisions — plus pay_applications, pay_application_lines, cost_codes, budget_hour_items, projects, user_projects, and organization_members have NO DB-level audit; they depend on client-side auditLogger inserts into activities and app-inserted member_activity rows, which a direct PostgREST call (any member's JWT + curl) bypasses entirely. Combined with hard-DELETE policies existing alongside the app's soft-delete convention (is_deleted columns, e.g. baseline:2406,2436), a field-role user can hard-delete a submittal (field+ DELETE, baseline:9613) or a member can delete documents rows with zero trace.
- **Impact:** An enterprise buyer's compliance checklist (SOC 2 change-tracking, contract-dispute defensibility) expects tamper-proof who/what/when on workflow and financial authorities. Today the audit trail for the app's most contractually significant records is optional-by-construction: any user who skips the UI leaves no record, and destructive deletes are unrecoverable and unattributed.
- **Fix:** Extend the existing audit_log_trigger to the authority tables in one migration, and (second step) convert app soft-delete tables to deny hard DELETE below admin. This reuses infrastructure already proven on 11 tables.

```
-- extend proven trigger to authority tables
DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'submittals','drawings','drawing_sets','drawing_revisions',
    'pay_applications','pay_application_lines','cost_codes',
    'budget_hour_items','projects','user_projects','organization_members']
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_audit_log AFTER INSERT OR DELETE OR UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger()', t);
  END LOOP;
END $$;
-- then: floor DELETE on soft-delete tables (submittals shown)
drop policy if exists project_delete on public.submittals;
create policy project_delete on public.submittals for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'admin'));
```

#### 🟡 M2 · app-files storage reads are org-scoped, not project-scoped, plus a founding-org legacy path
- **Severity:** medium · **Effort:** L · CONFIRMED
- **Location:** `supabase/migrations/20260101000020_baseline_seed.sql:59`
- **Issue:** The auth_read/auth_upload policies on storage.objects gate the app-files bucket by user_is_org_member(first-folder-uuid) (supabase/migrations/20260101000020_baseline_seed.sql:59,65) — any member of the org can read ANY object in the org's folder tree regardless of per-project membership, which is coarser than the table-layer rule where plain org members only see projects they're assigned to (user_has_project_access, baseline:2020-2039). Additionally the legacy 'uploads/' branch grants read/write to every member of the FOUNDING org (founding_org_id()), a known pending backfill (CLAUDE.md 'app-files legacy-path backfill'). Object paths leak via uploaded_files rows the user can see, but path guessing/enumeration of another project's files inside the same org is not blocked by storage RLS. By contrast email-attachments is correctly project-scoped (seed:68).
- **Impact:** A subcontractor PM invited to one project in a fabricator's org can read drawings, contracts, and pay-app PDFs uploaded for every other project in that org if they obtain or derive a path — a data-segregation failure inside a tenant that enterprise customers with per-project confidentiality (separate GCs, competing bids) will treat as a breach.
- **Fix:** Restructure new uploads to app-files/<org_id>/<project_id>/... and change auth_read/auth_upload to check user_has_project_access(folder[2]) when a second-level project uuid is present (org-membership fallback only for org-level assets); run the legacy 'uploads/' backfill to move objects under org/project prefixes, then drop the founding_org branch.

```
drop policy if exists "auth_read" on storage.objects;
create policy "auth_read" on storage.objects for select to authenticated
using (
  bucket_id = 'app-files' and (
    ( (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
      and public.user_has_project_access(((storage.foldername(name))[2])::uuid) )
    or ( (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
         and (storage.foldername(name))[2] is null
         and public.user_is_org_member(((storage.foldername(name))[1])::uuid) )
    -- keep legacy 'uploads/' branch ONLY until backfill completes, then delete it
  )
);
```

#### 🟡 M3 · Default privileges grant EXECUTE on every future public function (and ALL on sequences) to anon — the root cause of the recurring anon-executable-function advisor findings
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:11338`
- **Issue:** ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon (supabase/migrations/20260101000010_baseline_schema.sql:11338; sequences at 11328) means every function any migration creates is anon-executable unless explicitly revoked. This is why the live advisor flags enforce_org_member_guard (explicit anon grant at baseline:10468), notify_demo_request (20260623042453 — no revoke in file; it's SECURITY DEFINER and reads vault.decrypted_secrets), and prevent_schedule_task_cycle (20260626041744 — no revoke). The 20260629184030 fix attempted the right thing but its revoke (line 51) targets only anon+authenticated, not PUBLIC, so the implicit PUBLIC EXECUTE persists — which is why the advisor still flags enforce_project_update_guard. Practical exploitability is near-zero today (functions returning `trigger` are not callable through PostgREST), but the default keeps regenerating advisor findings and will silently expose the next non-trigger helper someone adds without a revoke.
- **Impact:** Every future migration is one forgotten REVOKE away from an unauthenticated-callable SECURITY DEFINER RPC, and enterprise security questionnaires / the Supabase advisor will keep surfacing these as findings, eroding buyer confidence.
- **Fix:** One hardening migration: drop anon from the function/sequence default privileges, then sweep-revoke PUBLIC+anon on the flagged trigger functions (re-granting anon only to get_invitation if kept anon-callable). Do NOT touch authenticated on user_has_project_* / org helpers — RLS depends on them. Also revoke the dead authenticated grant on billing_events (baseline:10841; RLS is deny-all so it's inert, but it fails grant-hygiene review).

```
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;

revoke all on function public.enforce_org_member_guard()      from public, anon;
revoke all on function public.enforce_project_update_guard()  from public;  -- anon/authenticated already revoked
revoke all on function public.notify_demo_request()           from public, anon, authenticated;
revoke all on function public.prevent_schedule_task_cycle()   from public, anon;
-- other trigger fns with anon grants (baseline dump): backcharge_touch_updated_at,
-- enforce_fab_release_gate, enforce_payapp_line_draft_only, enforce_submittal_fab_release_gate,
-- organizations_touch_updated_at, payapp_touch_updated_at, piece_production_touch_updated_at,
-- plan_member_limit, plan_project_limit, project_on_hold_stamp — same revoke pattern.

revoke all on table public.billing_events from authenticated;
```

#### ⚪ L1 · get_invitation(p_token) remains anon-callable and returns invitee PII — STILL-OPEN from the 2026-06-29 review, but the anon grant is unnecessary
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:10508`
- **Issue:** get_invitation (supabase/migrations/20260101000010_baseline_schema.sql:772-783, SECURITY DEFINER) returns org_id, org_name, role, email, status, expired for any token and is granted to anon (baseline:10508) with no REVOKE FROM PUBLIC (contrast accept_invitation, baseline:10394-10396, which is correctly authenticated-only). Enumeration is impractical — the token is gen_random_uuid() v4 (baseline:4210, ~2^122) — so exposure requires a leaked/forwarded invite link, and PostgREST rate limiting is absent. Decisive detail: the ONLY client caller lives inside the authenticated shell (src/pages/OrgOnboarding.jsx:48, mounted from src/boot/AuthenticatedApp.jsx:9), so nothing in the product needs the anon grant.
- **Impact:** An unauthenticated holder of a forwarded or logged invite URL can harvest the invitee's email address and the workspace's name/role before ever signing in — minor PII disclosure that a privacy review (GDPR data-minimization) would flag, with zero product benefit in exchange.
- **Fix:** Revoke anon (and PUBLIC) EXECUTE on get_invitation, keeping authenticated; optionally also stop returning the raw email (the accept flow re-verifies email server-side in accept_invitation anyway, so a masked hint suffices for the UI).

```
revoke all on function public.get_invitation(uuid) from public, anon;
-- authenticated grant stays (OrgOnboarding calls it post-login)

-- optional data-minimization: mask the email in the payload
--   'email', regexp_replace(i.email, '(^.).*(@.*$)', '\1***\2')
notify pgrst, 'reload schema';
```

#### ⚪ L2 · feature_flags user_overrides (per-email overrides) readable by every authenticated user across all tenants
- **Severity:** low · **Effort:** M · unverified-low
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:9243`
- **Issue:** feature_flags_select is USING(true) for all authenticated users (supabase/migrations/20260101000010_baseline_schema.sql:9243) and the table carries user_overrides jsonb keyed by email (baseline:3900). Any logged-in user of any org can list every flag, its description, and the email addresses of users in OTHER tenants who have overrides — cross-tenant metadata/PII leakage from a global table. (Writes are correctly system-admin-only, baseline:9231-9239.)
- **Impact:** A curious customer can enumerate unreleased feature names and the emails of other companies' users from the flag table — embarrassing in an enterprise pen test even if operationally minor.
- **Fix:** Serve flag evaluation through a definer RPC that returns only {flag_key, enabled_for_me} (computing the caller's override server-side), and drop the direct SELECT policy — or at minimum move user_overrides into a separate admin-only table.

```
create or replace function public.my_feature_flags()
returns table(flag_key text, enabled boolean)
language sql stable security definer set search_path to 'public' as $$
  select f.flag_key,
         coalesce((f.user_overrides ->> (select lower(u.email) from auth.users u where u.id = auth.uid()))::boolean,
                  f.enabled)
  from public.feature_flags f;
$$;
revoke all on function public.my_feature_flags() from public, anon;
grant execute on function public.my_feature_flags() to authenticated;
drop policy if exists feature_flags_select on public.feature_flags;
create policy feature_flags_admin_select on public.feature_flags
  for select to authenticated using (public.user_is_system_admin());
```

#### ⚪ L3 · demo_requests anon INSERT has no rate limiting — spam/DoS vector that also fans out one pg_net webhook per row
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/migrations/20260623032908_demo_requests.sql:24`
- **Issue:** The public landing form allows unauthenticated INSERTs bounded only by per-field length checks (supabase/migrations/20260623032908_demo_requests.sql:23-33); nothing limits volume, and each row fires the notify_demo_request pg_net POST (20260623042453_demo_request_notify_webhook.sql:29-41). A script can insert thousands of rows per minute, bloating the table, flooding the Slack/Make webhook (and any per-request cost there), and burying real leads.
- **Impact:** Cheap unauthenticated write amplification: junk data growth plus notification-channel flooding that makes the lead pipeline unusable during an attack.
- **Fix:** Add a cheap DB-side throttle in the trigger path (reject when recent-row count exceeds a cap) and/or front the form with the existing edge-function layer + CAPTCHA. A per-15-minute global cap keeps the migration tiny and cannot block legitimate low-volume leads.

```
create or replace function public.demo_requests_throttle()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if (select count(*) from public.demo_requests
      where created_at > now() - interval '15 minutes') >= 20 then
    raise exception 'demo request rate limit exceeded' using errcode = 'P0001';
  end if;
  return new;
end; $$;
revoke all on function public.demo_requests_throttle() from public, anon, authenticated;
create trigger demo_requests_throttle before insert on public.demo_requests
  for each row execute function public.demo_requests_throttle();
```

#### ⚪ L4 · pg_net extension installed in the public schema (live-advisor extension_in_public)
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `supabase/migrations/20260101000000_baseline_extensions.sql:15`
- **Issue:** The baseline documents pg_net as living in public on the live project (supabase/migrations/20260101000000_baseline_extensions.sql:15, 'pg_net (public)'), while uuid-ossp/pgcrypto/pg_trgm were correctly placed in the extensions schema (lines 21-23). Extensions in public pollute the API-exposed schema's namespace and are flagged by the Supabase security advisor that enterprise evaluators run.
- **Impact:** Advisor noise on every security review and a marginally larger attack surface in the exposed schema; no direct exploit (net.* objects live in the net schema and http_post is only invoked from the SECURITY DEFINER trigger).
- **Fix:** Relocate the extension on the live database (requires pg_net >= 0.10): ALTER EXTENSION pg_net SET SCHEMA extensions; then update baseline_extensions.sql's commented guidance so a fresh replay matches. This is a live-DB operation via Supabase MCP/dashboard, not a replayable migration on prod (the baseline is repair-marked).

```
-- live (Supabase MCP execute_sql or dashboard), pg_net >= 0.10:
alter extension pg_net set schema extensions;
-- notify_demo_request calls net.http_post via the net schema and is unaffected.
```

### Edge functions

The edge-function tier is in materially better shape than a typical seed-stage SaaS: JWT verification, RLS-scoped data access, Stripe signature/replay/idempotency handling, attachment guards, and PII-aware logging are all deliberate and mostly well executed. Of the three prior-review open items, two are verified FIXED — email-send's org owner/admin 403 (email-send/index.ts:102-162) and the Stripe out-of-order re-grant (stripe-billing/index.ts:88-99, with a CI-run replay test) — while the llm-proxy quota TOCTOU is STILL-OPEN (quota.ts:106-149 reads then decides; the usage row lands only after the provider call, so concurrent bursts exceed the cap). The most serious new finding is that project-export, the advertised per-tenant backup, silently truncates every table at the PostgREST max-rows cap (default 1000) with no pagination — a data-integrity failure in exactly the artifact enterprises rely on for offboarding. The remaining gaps are enterprise-hardening rather than active holes: a service-role RLS-bypass env flag in schedule-assistant, a single cross-tenant email-ingest secret accepted via query param, no fail-fast on an empty Stripe webhook secret, rate limits that are off unless env-configured, internal error text echoed to clients, and missing outbound timeouts/idempotency. With the truncation fix, the quota race closed, and the config-hygiene items (caps set, ALLOWED_ORIGINS locked, deprecated functions deleted), this tier would pass a standard enterprise security review.

**Strengths:**
- Prior-review item (a) VERIFIED FIXED: email-send access/role check now mirrors user_has_project_access — direct user_projects role first, then org owner/admin fallback via projects.org_id -> organization_members (supabase/functions/email-send/index.ts:102-162); org owners/admins are no longer wrongly 403'd, and sending is additionally role-gated to owner/admin/pm (lines 120, 529-535).
- Prior-review item (b) VERIFIED FIXED: stripe-billing webhook re-fetches the LIVE subscription and applies current state with a terminal-status check, so a late customer.subscription.updated after .deleted no longer re-grants a canceled plan (supabase/functions/stripe-billing/index.ts:88-99); covered by webhookLogic.ts pure-function extraction + __tests__/webhookReplay.test.ts in CI.
- Stripe webhook posture is genuinely strong overall: signature verification with the SDK's timestamp tolerance (index.ts:117), DB-backed replay/idempotency via billing_events UNIQUE(stripe_event_id) with the processed-marker written only AFTER successful handling so transient failures get retried instead of dropped (index.ts:121-153), open-redirect defense on checkout/portal return URLs via strict isAllowedOrigin (index.ts:174-179), and live/test key separation anchored in billing_config.livemode defaulting to live.
- Consistent, deliberate auth pattern across functions: direct /auth/v1/user JWT verification (immune to supabase-js ES256 lag), RLS-scoped clients for all user-data reads (project-export/index.ts:206, schedule-assistant/index.ts:249-254), and service-role usage confined to telemetry/audit/config writes.
- project-export has an exemplary authorization + audit shape: explicit RLS-based 403 gate before any data read (index.ts:212-224), and a service-role audit row the client can neither forge nor suppress — with the export ABORTED if the audit write fails (index.ts:255-260).
- Shared attachment hygiene (_shared/attachments.ts): path-traversal-safe filename sanitization, a comprehensive executable/script extension denylist, and per-file/per-message/count caps, applied on the hostile inbound path (email-ingest/index.ts:807-831) with project existence + UUID validation and Message-ID dedup before any write.
- llm-proxy layers real cost controls: priced-model allowlist on the RESOLVED model (index.ts:352-358), maxTokens clamp (365-369), break-glass LLM_KILL_SWITCH (295-301), fail-CLOSED quota for expensive document/image use-cases vs fail-open for cheap ones (97-104, 376), and success+failure telemetry with cost attribution for dashboards.
- PII-aware logging discipline throughout: email-send logs recipient counts not addresses and omits subjects (index.ts:629-636), email-ingest logs ids/classification only (885-889), project-export logs scope not rows (263-266), and llm-proxy never logs prompt or document contents — matching the repo's stated data-sensitivity rules.
- email-send blocks from-address spoofing: a caller-supplied from_email must match an ACTIVE project email account or the request is rejected (index.ts:537-568).
- The CORS opt-in design is documented with its threat model and rationale (_shared/cors.ts:1-21), and isAllowedOrigin deliberately stays strict independent of the permissive default so redirect-target validation never widens.


#### 🟠 H2 · project-export silently truncates each table at the PostgREST max-rows cap (default 1000) — incomplete backups
- **Severity:** high · **Effort:** S · CONFIRMED
- **Location:** `supabase/functions/project-export/index.ts:231`
- **Issue:** supabase/functions/project-export/index.ts:231 fetches each of the 15 export tables with a single unpaginated `rls.from(table).select("*").eq("project_id", projectId)`. Supabase's PostgREST enforces a server-side max-rows limit (hosted default 1000) that silently caps the result — no error is raised. The function's own comment (lines 229-230) says 'a partial backup that silently drops a table is worse than none', yet any project with >1000 drawings, schedule_tasks, expenses, etc. gets a silently partial export presented as a complete backup (row_counts reflect the truncated set, so the envelope self-consistently lies). Exact cap depends on the project's PostgREST db-max-rows setting; the code has no defense at any value.
- **Impact:** The advertised per-tenant backup/export (a common enterprise contractual requirement and the stated offboarding path) is silently incomplete for any real-scale project. A customer restoring or offboarding from this export loses rows without warning — data-loss discovered only after the fact.
- **Fix:** Paginate every table read with .range() until a short page is returned; optionally cross-check with a Prefer: count=exact head request and abort on mismatch.

```
const PAGE = 1000;
for (const table of PROJECT_EXPORT_TABLES) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await rls
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[project-export] ${table} fetch error: ${error.message}`);
      return errorResponse(500, `Failed to read ${table}`);
    }
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < PAGE) break;
  }
  tableResults.push({ table, rows });
}
```

#### 🟡 M4 · STILL-OPEN (prior-review item c): llm-proxy quota is read-then-decide — concurrent bursts exceed the 24h spend cap
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/functions/llm-proxy/quota.ts:106`
- **Issue:** STILL-OPEN. supabase/functions/llm-proxy/quota.ts:106-149 reads the rolling-24h aggregate (get_llm_usage_window) and allows the request if the sum is under the cap; the usage row that would raise the sum is only written AFTER the provider call completes (llm-proxy/index.ts:420-437). There is no reservation, lock, or atomic increment, so N concurrent requests all read the same pre-burst usage and all pass — the cap can be overshot by roughly (concurrency x max single-call cost). The 2000ms read timeout (quota.ts:40) also fails open for cheap use-cases under load, widening the window.
- **Impact:** An authenticated user (or a runaway client loop) can blow through LLM_DAILY_COST_LIMIT_USD / LLM_DAILY_REQUEST_LIMIT by parallelizing requests — the spend guard is advisory under concurrency. Bounded blast radius (authenticated users, priced-model allowlist, 16k maxTokens clamp, kill switch), but the cap does not do what its name promises.
- **Fix:** Make check+reserve atomic in one SECURITY DEFINER RPC: take a per-user advisory transaction lock, re-check the window, and insert a reservation row (estimated cost) before dispatch; reconcile the row with actual cost after the provider call. Call it from checkUserQuota instead of the read-only aggregate.

```
-- migration: atomic reserve (closes the read-then-decide race)
create or replace function public.reserve_llm_call(
  p_user uuid, p_cost_cap numeric, p_req_cap int, p_est_cost numeric)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  -- serialize per user: concurrent bursts can no longer all read "under cap"
  perform pg_advisory_xact_lock(hashtextextended('llm:' || p_user::text, 0));
  select (p_cost_cap <= 0 or coalesce(sum(cost_usd),0) + p_est_cost <= p_cost_cap)
     and (p_req_cap  <= 0 or count(*) + 1 <= p_req_cap)
    into v_ok
    from public.llm_telemetry
   where user_id = p_user and occurred_at >= now() - interval '24 hours';
  if v_ok then
    insert into public.llm_telemetry
      (user_id, use_case, provider, model, success, latency_ms, cost_usd, metadata)
    values (p_user, 'reservation', 'internal', 'pending', true, 0, p_est_cost,
            jsonb_build_object('reservation', true));
  end if;
  return v_ok;
end $$;
revoke all on function public.reserve_llm_call from public;
grant execute on function public.reserve_llm_call to service_role;
-- llm-proxy: call reserve_llm_call pre-dispatch; update the reservation row
-- with the real cost (or delete it on provider failure) post-call.
```

#### 🟡 M5 · schedule-assistant SERVICE_ROLE_OVERRIDE env flag disables RLS for all callers — one config flip breaks tenant isolation
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/schedule-assistant/index.ts:236`
- **Issue:** supabase/functions/schedule-assistant/index.ts:236-247: if SERVICE_ROLE_OVERRIDE=true is set, EVERY request's Supabase client is built with the service-role key. The tool handlers scope queries only by the client-supplied project_id (e.g. tool-handlers.ts:213-227, 287-298, 445-458) with no membership check — the function relies entirely on RLS for authorization. With the override on, any authenticated user of any tenant can pass any project_id and read another organization's schedule tasks, RFIs, deliveries, and drawings. A debug backdoor this close to the tenant boundary should not ship in production code.
- **Impact:** A single environment variable set by an operator (or via a compromised Supabase dashboard session) silently converts the assistant into a cross-tenant read API for all schedule/RFI/delivery/drawing data. The only signal is a console.warn in function logs.
- **Fix:** Delete the override path entirely; if a service-role client is ever needed for diagnostics, gate it behind a separate non-production function. Also verify the env var is unset on the live project.

```
function createSupabaseClient(authHeader: string): SupabaseClient {
  // RLS-enforced only. The SERVICE_ROLE_OVERRIDE escape hatch is removed:
  // tool handlers scope only by the client-supplied project_id, so a
  // service-role client here === cross-tenant reads for any caller.
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
}
```

#### 🟡 M6 · email-ingest: one global shared secret authorizes injection into every tenant's project, and is accepted via URL query param
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/email-ingest/index.ts:92`
- **Issue:** supabase/functions/email-ingest/index.ts:79-96: a single EMAIL_WEBHOOK_SECRET authorizes ingestion into ANY project in ANY organization (the project UUID in the URL is the only per-tenant scoping, and it's guessable/enumerable data, not a credential). The secret is also accepted as a `?secret=` query parameter (lines 92-93), which leaks into Power Automate run history, proxy/gateway logs, and any URL-logging middleware — the repo's own docs (docs/email-ingest-power-automate.md:189-196) acknowledge both weaknesses. There is no rotation overlap (single value), and the comparison is not constant-time (negligible in practice). Sender identity in the payload is unauthenticated by design (the function cannot see SPF/DKIM results), so anyone holding the secret can spoof any sender into any tenant's inbox. Mitigations that exist: messages stage as import_status='pending' for human review (line 784), project existence is validated (lines 709-722), and attachments are capped/denylisted.
- **Impact:** If any one tenant's flow configuration or log leaks the secret, an attacker can inject spoofed correspondence and attachments into every tenant's email inbox (write-only; staged behind human review) and consume storage/classification budget. Enterprise buyers reviewing a multi-tenant SaaS will flag a shared cross-tenant inbound credential immediately.
- **Fix:** Issue a per-project ingest token (store a SHA-256 hash on the projects row or email_accounts), validate it against the URL's project id, accept it ONLY via header, and keep the old global secret temporarily as a dual-accept window for rotation.

```
// per-project credential: projects.email_ingest_token_hash (sha-256 hex)
async function authenticateWebhook(
  req: Request, projectId: string, supabaseUrl: string, serviceKey: string,
): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  const provided = req.headers.get("x-webhook-secret")
    ?? (auth?.startsWith("Bearer ") ? auth.slice(7) : null);
  if (!provided) return false; // no query-param path — it leaks into logs
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(provided));
  const hash = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/projects?id=eq.${projectId}` +
    `&email_ingest_token_hash=eq.${hash}&select=id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const rows = resp.ok ? await resp.json() : [];
  return Array.isArray(rows) && rows.length > 0;
}
```

#### 🟡 M7 · No default rate limiting anywhere: LLM caps are no-ops until env is set; email-send and email-ingest have no volume guard at all
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/llm-proxy/quota.ts:94`
- **Issue:** The only rate limits in the edge tier are opt-in env vars: llm-proxy's quota returns ok immediately when both caps are unset (supabase/functions/llm-proxy/quota.ts:94), and email-ingest's classify cap only guards LLM spend, not ingestion volume. email-send (supabase/functions/email-send/index.ts) has NO per-user or per-project send cap — any pm-role user can loop unlimited outbound email through the tenant's Resend/Graph identity (deliverability/reputation damage, provider cost). email-ingest accepts unlimited messages per secret-holder (25 files/50MB per message, but unbounded messages → storage exhaustion). There is no per-IP throttle on any function (unauthenticated 401 paths included).
- **Impact:** A compromised account, runaway client, or leaked webhook secret can generate unbounded provider spend, storage growth, or email-domain reputation damage before anyone notices. Enterprise readiness expects abuse limits ON by default, not opt-in.
- **Fix:** Set LLM_DAILY_COST_LIMIT_USD and LLM_DAILY_REQUEST_LIMIT in production (manual, dashboard); add a per-user daily send cap in email-send (count outbound email_messages by sent_by in 24h) and a per-project daily ingest cap in email-ingest, both with sane defaults that env can raise.

```
// email-send: cheap per-user daily cap (default 200; env-overridable)
const SEND_DAILY_LIMIT = Number(Deno.env.get("EMAIL_SEND_DAILY_LIMIT") ?? "200");
const sinceIso = new Date(Date.now() - 86_400_000).toISOString();
const cntResp = await fetch(
  `${supabaseUrl}/rest/v1/email_messages?sent_by=eq.${user.userId}` +
  `&direction=eq.outbound&sent_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=1`,
  { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
               Prefer: "count=exact" } },
);
const sentToday = Number((cntResp.headers.get("content-range") ?? "/0").split("/")[1]) || 0;
if (SEND_DAILY_LIMIT > 0 && sentToday >= SEND_DAILY_LIMIT) {
  return errorResponse(429, "Daily outbound email limit reached for your account");
}
```

#### ⚪ L5 · Error responses echo internal exception text and upstream/PostgREST error bodies to clients
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/functions/llm-proxy/index.ts:495`
- **Issue:** Multiple functions return raw internals to the caller: llm-proxy's outer handler returns `Unhandled ${name}: ${message}` (supabase/functions/llm-proxy/index.ts:495) and the provider path returns the FULL upstream error body (`${provider} handler: ${message}` at index.ts:477, where message embeds the entire Anthropic/OpenAI response text via providers/anthropic.ts:84 and providers/openai.ts:179). email-ingest returns PostgREST error detail slices to the webhook caller (email-ingest/index.ts:796) and raw parse/internal messages (738, 906); email-send/index.ts:652, project-export/index.ts:277, and schedule-assistant/index.ts:226-229 all return err.message on unhandled errors. No secrets were observed on these paths, but PostgREST details disclose schema/table/constraint names and upstream bodies disclose provider internals.
- **Impact:** Information disclosure that aids attackers in fingerprinting the schema and infrastructure; unprofessional error surfaces an enterprise pen test will list. No direct data exposure observed.
- **Fix:** Log the detail server-side (already done) and return a generic message + correlation id to the client on all 5xx paths; whitelist only known-safe messages (LLMError with curated text) for passthrough.

```
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    return await handle(req);
  } catch (err) {
    const id = crypto.randomUUID().slice(0, 8);
    console.error(`[llm-proxy] [${id}] Unhandled:`, err);
    return json(
      { error: `Internal error (ref ${id})`, protocol_version: PROTOCOL_VERSION },
      500,
    );
  }
});
```

#### ⚪ L6 · stripe-billing out-of-order guard degrades to trusting the stale event payload when the live re-fetch fails
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/functions/stripe-billing/index.ts:95`
- **Issue:** The out-of-order fix (supabase/functions/stripe-billing/index.ts:88-99) re-fetches the live subscription, but on retrieve failure it falls back to the event payload (`catch (_e) { /* keep event payload */ }` at line 95). In that narrow window the original bug re-appears: a late customer.subscription.updated arriving after .deleted, coinciding with a transient Stripe API error, re-grants the canceled plan. Since the webhook already returns 500 on handler errors so Stripe retries (lines 139-143), failing here is strictly safer than applying stale state.
- **Impact:** Rare-path plan re-grant after cancellation (revenue leakage) requiring an out-of-order delivery AND a concurrent Stripe API failure — low probability, but the fallback undermines the guard it sits inside.
- **Fix:** On retrieve failure, throw so the delivery returns 500 and Stripe retries with the guard intact, instead of applying the possibly-stale payload.

```
let sub;
try {
  sub = await stripe.subscriptions.retrieve(evtSub.id);
} catch (e) {
  // Never apply a possibly out-of-order payload; 500 → Stripe retries.
  throw new Error(`subscription retrieve failed for ${evtSub.id}: ${(e as Error).message}`);
}
```

#### ⚪ L7 · email-send stores/sends outbound attachments without the dangerous-extension denylist applied to inbound
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/functions/email-send/index.ts:511`
- **Issue:** supabase/functions/email-send/index.ts:511-519 validates only filename presence and total size; storeSentAttachments (lines 337-409) writes user-supplied bytes into the email-attachments bucket with only name sanitization. Unlike email-ingest (index.ts:815), isDangerousAttachment and the per-file MAX_ATTACHMENT_BYTES cap from _shared/attachments.ts are never applied, so an authenticated pm can send and persist .exe/.js/.html etc. through the project mailbox — bypassing the app's single-upload-path validation rule (uploadValidation.ts applies only to the client storage path).
- **Impact:** A compromised pm account can use the tenant's own mail identity to distribute executables and park them in project storage where other members can download them; also inconsistent with the repo's fail-closed upload contract.
- **Fix:** Apply the shared guards in the validation loop before sending/storing.

```
import {
  isDangerousAttachment,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
} from "../_shared/attachments.ts";

for (const att of attachments) {
  if (!att.filename || !att.content_base64) {
    return errorResponse(400, "Each attachment requires filename and content_base64");
  }
  if (isDangerousAttachment(att.filename)) {
    return errorResponse(400,
      `Attachment type not allowed: ${sanitizeAttachmentName(att.filename)}`);
  }
  const est = Math.floor(att.content_base64.length * 0.75);
  if (est > MAX_ATTACHMENT_BYTES) {
    return errorResponse(413, "Attachment exceeds the 25 MB per-file limit");
  }
  attachmentBytes += est;
}
```

#### ⚪ L8 · No timeouts or retries on outbound provider calls (Anthropic, OpenAI, Resend, MS Graph, llm-proxy hop)
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/functions/llm-proxy/providers/anthropic.ts:64`
- **Issue:** None of the external fetches are bounded: providers/anthropic.ts:64 and providers/openai.ts (chat completions fetch), email-send's Resend (index.ts:196), Graph token (231) and sendMail (293) calls, email-ingest's OpenAI classify (index.ts:540), and schedule-assistant's llm-proxy hop (index.ts:380) all run without AbortSignal. A hung upstream holds the request until the edge runtime's wall-clock kill, presenting to users as an opaque multi-minute hang; there is also no retry for transient 5xx on any provider path (only the quota read at quota.ts:115 is bounded).
- **Impact:** Poor failure behavior under provider degradation: stuck spinners, wasted edge compute, and no graceful 504. Not a security issue.
- **Fix:** Add AbortSignal.timeout to every external fetch (60-90s for LLM calls, 15s for token/mail APIs) and map AbortError to a clean 504; optionally one retry with jitter for idempotent GET/token calls.

```
// providers/anthropic.ts (same pattern for openai/resend/graph)
const LLM_TIMEOUT_MS = 90_000;
resp = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: { /* unchanged */ },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
});
// in the catch: err.name === "TimeoutError" →
//   throw new LLMError("Anthropic timed out", 504, "upstream_timeout");
```

#### ⚪ L9 · email-send has no idempotency key — client retry after a timeout double-sends the email
- **Severity:** low · **Effort:** M · unverified-low
- **Location:** `supabase/functions/email-send/index.ts:583`
- **Issue:** supabase/functions/email-send/index.ts has no request-level idempotency: if the client times out or retries after the provider call succeeded but before the response landed, the same email is sent twice (and stored twice — external_id is freshly generated per attempt at line 424 when the provider returns no id). The app's own Field Today module already established a client_op_id dedup convention for offline creates; email-send predates it. Resend supports an Idempotency-Key header natively.
- **Impact:** Duplicate outbound correspondence to customers/GCs on flaky connections — embarrassing rather than dangerous, but real for field/mobile users.
- **Fix:** Accept an optional client_op_id, check email_messages for an existing outbound row with that op id before sending, and pass it through as Resend's Idempotency-Key.

```
// request: { ..., client_op_id?: string }
if (body.client_op_id) {
  const dup = await fetch(
    `${supabaseUrl}/rest/v1/email_messages?project_id=eq.${body.project_id}` +
    `&direction=eq.outbound&parsed_metadata->>client_op_id=eq.${encodeURIComponent(body.client_op_id)}` +
    `&select=id&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const rows = dup.ok ? await dup.json() : [];
  if (Array.isArray(rows) && rows.length) {
    return jsonResponse({ success: true, message_id: rows[0].id, deduped: true });
  }
}
// sendViaResend: headers["Idempotency-Key"] = body.client_op_id ?? crypto.randomUUID();
// storeSentMessage: include client_op_id in parsed_metadata.
```

#### ⚪ L10 · stripe-billing has no top-level error handler — uncaught Stripe/DB exceptions return CORS-less generic 500s
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/functions/stripe-billing/index.ts:103`
- **Issue:** supabase/functions/stripe-billing/index.ts:103 wraps nothing: the checkout/portal paths call stripe.customers.create, stripe.checkout.sessions.create, and admin DB reads (lines 186-212) with no try/catch, so any thrown error (Stripe API down, bad price id, DB hiccup) escapes to the Deno runtime's default 500 response, which lacks the function's CORS headers and JSON error shape. The browser then reports an opaque CORS failure instead of the actual error, making production billing incidents needlessly hard to debug from the client side. (Every other function in the repo has the outer try/catch.)
- **Impact:** Billing failures surface to users as generic 'network error' with no actionable message, and to support as CORS red herrings — operability gap on the revenue path.
- **Fix:** Wrap the handler body in try/catch and return the standard JSON error envelope with CORS headers.

```
Deno.serve(async (req) => {
  try {
    return await handleBilling(req); // extract current body into handleBilling
  } catch (err) {
    console.error("[stripe-billing] Unhandled:", err);
    return json({ error: "Billing service error — please retry" }, 500);
  }
});
```

#### ⚪ L11 · CORS is permissive-by-default in production until ALLOWED_ORIGINS is set (as designed, but should be locked for enterprise posture)
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `supabase/functions/_shared/cors.ts:46`
- **Issue:** As designed and well documented (supabase/functions/_shared/cors.ts:42-49 and llm-proxy/index.ts:106-125): CORS is `*` unless ALLOWED_ORIGINS is explicitly set to real origins. Because auth is a Bearer JWT (no cookies), permissive CORS does not enable session riding, and isAllowedOrigin() stays strict for the Stripe redirect target regardless — the design tradeoff is sound. Remaining exposure: any website can invoke the functions from a victim's browser IF it separately obtains a token, and unauthenticated endpoints can be probed cross-origin. schedule-assistant (index.ts:517-529) and email-ingest (index.ts:64-68) hardcode `*` and ignore the lockdown entirely. Enterprise security questionnaires will flag wildcard CORS on API endpoints. UNCONFIRMED: whether ALLOWED_ORIGINS is currently set on the live project cannot be read from the repo.
- **Impact:** Defense-in-depth gap only (bearer-token model), but a guaranteed pen-test/questionnaire finding; two functions can never be locked down even when the env is set.
- **Fix:** Set ALLOWED_ORIGINS to the production origins on all browser-facing functions (manual, Supabase dashboard — takes effect without redeploy), and migrate schedule-assistant to the shared corsHeaders(req) helper so the lockdown applies uniformly (email-ingest is webhook-only and can drop CORS entirely).

```
// schedule-assistant/index.ts — use the shared, lockdown-aware helper
import { corsHeaders as sharedCors } from "../_shared/cors.ts";
function corsHeaders(req?: Request) {
  return {
    ...sharedCors(req),
    // extra headers supabase-js functions.invoke() sends:
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, apikey, x-client-info, x-supabase-auth",
    "Access-Control-Max-Age": "86400",
  };
}
// then pass `req` at the OPTIONS + json() call sites
```

#### ⚪ L12 · Deprecated edge functions reportedly still deployed (sharepoint-proxy, bluebeam-proxy) plus a dangling stripe-worker caller — stale attack surface and log noise
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `supabase/functions:1`
- **Issue:** UNCONFIRMED: cannot be verified from the repo worktree (the functions are deleted from supabase/functions/), but the project's own operating docs (CLAUDE.md §16) state sharepoint-proxy and bluebeam-proxy are still DEPLOYED on the live Supabase project while no longer client-invoked, and that a dangling cron/pg_cron caller POSTs the deleted stripe-worker every ~60s producing perpetual 404s in the edge logs. Deployed-but-unmaintained functions holding old OAuth/proxy logic are unnecessary attack surface, and the 404 spam degrades log-based alerting signal.
- **Impact:** Stale endpoints with historical token-proxy code remain reachable; recurring 404 noise trains operators to ignore edge-function errors — both are enterprise-hygiene failures an auditor will note.
- **Fix:** Run `npx supabase functions delete sharepoint-proxy --project-ref kjrwqagyeswwoxpjkcko` and the same for bluebeam-proxy; locate and drop the pg_cron job (or external scheduler entry) still POSTing stripe-worker (check `select * from cron.job;`).

### CI/CD & deployment

The core deploy pipeline is genuinely well designed for a small team: a single CI-gated GitHub Actions path (lint + 4 typecheck gates + full Vitest + production build) is the sole route to production, Vercel git auto-deploy is off, and a red push physically cannot reach steelbuild-pro.com. However, the pipeline only covers the frontend: database migrations are applied live to the single production database by hand (MCP) with no CI application, no drift detection, and no rollback story, and all 7 edge functions are deployed manually with no automation or drift check — these are the two biggest enterprise gaps. There is no staging environment at all, no branch protection (~10 agents push straight to main, and workflow tampering could exfiltrate VERCEL_TOKEN), and deploy observability is thin (no git SHA metadata on Vercel CLI deploys, Sentry release not stamped per deploy, no post-deploy health check, E2E smoke opt-in and non-blocking). Supply-chain hygiene is middling: npm ci with a committed lockfile is good, but actions are tag-pinned, the Vercel CLI floats on @latest, and there is no dependabot or secret-scanning job. Overall: solid foundation, but an enterprise buyer would immediately flag single-environment live-DB changes, manual edge-function deploys, and the absence of branch protection.

**Strengths:**
- CI-gated sole-path production deploy: .github/workflows/ci.yml deploy job needs the full ci job and only runs on push to main, paired with vercel.json git.deploymentEnabled.main=false — a red lint/typecheck/test/build cannot reach production (ci.yml:118-159, vercel.json:5).
- Unusually strong blocking validation ladder for a mixed JS/TS SPA: ESLint, tsc for TS and JS, a strictNullChecks ratchet AND a noImplicitAny ratchet (shrink-only ignore lists in scripts/strict-typecheck.mjs / scripts/noimplicitany-typecheck.mjs), full Vitest suite, and a real production Vite build (ci.yml:67-116).
- Deterministic installs in CI: npm ci against a committed package-lock.json, Node 20 pinned via setup-node and package.json engines (ci.yml:58-65, package.json:6-8).
- Post-deploy Playwright E2E smoke job is already wired (sign-in, drawings/submittals/RFIs, server-side fab-release gate incl. an RLS-deny assertion) with excellent operator documentation in e2e/README.md — it just needs the E2E_ENABLED variable + secrets to switch on (ci.yml:177-228).
- Sentry source-map upload is integrated correctly: gated on SENTRY_AUTH_TOKEN, hidden sourcemaps, .map files deleted after upload, failures swallowed so a Sentry outage can never fail a deploy (vite.config.js:32-140).
- Secrets hygiene inside the workflow: the ci job runs with placeholder env only (no real Supabase values), and VERCEL_* secrets are confined to the deploy job steps that need them (ci.yml:50-52, 130-159).
- Production hosting config carries real security headers (HSTS, X-Frame-Options DENY, nosniff, Permissions-Policy, CSP-Report-Only with Sentry report-uri) and immutable asset caching (vercel.json:7-37).
- The DB migration history was re-baselined with a written, verified runbook (docs/db-baseline-cutover.md) and 'supabase db push' now reports clean — the raw material for automated drift detection exists.
- RLS verification SQL scripts exist in-repo (supabase/scripts/verify_rls_isolation.sql, probe_anon_access.sql) — ready to be automated.


#### 🟠 H3 · No staging environment — every change ships straight to the single production environment
- **Severity:** high · **Effort:** L · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:125`
- **Issue:** There is exactly one environment: production (steelbuild-pro.com + one Supabase project kjrwqagyeswwoxpjkcko). The only deploy job in .github/workflows/ci.yml (line 125) targets production; vercel.json line 6's ignoreCommand additionally suppresses preview builds (exit 0 when VERCEL_ENV=preview means 'skip build'), so not even Vercel preview URLs exist for validating a change before it ships. DB schema changes are applied live to the production database (see separate finding). A second Vercel project (steel-build-pro-rev-2) exists but is unused/slated for retirement.
- **Impact:** Blast radius of any bad change is 100% of tenants immediately. There is no place to rehearse a risky migration, test an edge-function change against real auth, or let the owner field-verify a moat-workflow change before customers see it. Enterprise buyers routinely ask 'describe your staging environment' in security questionnaires — the honest answer today is 'none'.
- **Fix:** Minimal staging story on the existing stack: (1) repurpose the already-wired steel-build-pro-rev-2 Vercel project as 'staging', deployed by a new CI job on a `staging` branch (or on every main push, before prod); (2) point it at a separate staging Supabase project (free tier is fine) or a Supabase preview branch (org is on Pro), seeded from the 3-file baseline via `supabase db push`; (3) apply migrations to staging first, run the E2E smoke there, then promote. Re-enable Vercel preview deploys by deleting the ignoreCommand.

```
# ci.yml — add before the prod deploy job
  deploy-staging:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    concurrency: { group: staging-deploy, cancel-in-progress: false }
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_STAGING_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm }
      - run: npm i -g vercel@lat.pinned.version
      - run: vercel pull --yes --environment=production --token="$VERCEL_TOKEN"
        env: { VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }} }
      - run: vercel build --prod --token="$VERCEL_TOKEN"
        env: { VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }} }
      - run: vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
        env: { VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }} }
# then make `deploy` (prod) `needs: [ci, deploy-staging]`
# Staging Supabase project + env vars (VITE_SUPABASE_*) are a
# one-time dashboard step; keep staging env in the staging
# Vercel project so `vercel pull` picks it up automatically.
```

#### 🟠 H4 · Database migrations bypass the pipeline entirely: applied live to prod by hand, no drift detection, no rollback path
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/migrations:1`
- **Issue:** supabase/migrations/ (3 baseline + 9 incremental files at commit 642ce154) is applied to the production database manually via the Supabase MCP, then the SQL file is committed afterward — CI never applies, validates, or even parses migrations, and nothing detects drift between the repo and prod schema_migrations. The lockstep discipline that prevents re-drift (docs/db-baseline-cutover.md lines 158-161: filename must equal the recorded version) is a documented convention enforced by no tooling. There are no down migrations, and no restore/rollback runbook exists in the repo (grep for 'rollback' in docs/ hits only unrelated plan files).
- **Impact:** This is the exact failure mode that already happened once (200 stale schema_migrations rows, migration replay broken for weeks until the 2026-06-20 re-baseline). A hand-applied migration that diverges from the committed file, or a committed file never applied, is silently invisible until something breaks in prod. If a bad migration lands there is no tested path back — 'restore from Supabase daily backup' is untested and loses up to 24h of tenant data. For a multi-tenant SaaS, schema changes with no CI validation and no rollback rehearsal is a top-3 enterprise red flag.
- **Fix:** Add a read-only drift-check job to CI that links the Supabase CLI to prod and fails when repo migrations and remote schema_migrations disagree (db push --dry-run + migration list). Adopt expand/contract discipline for schema changes (additive first, destructive later) so the previous frontend build always works against the new schema, making Vercel instant-rollback a real rollback. Write and rehearse a restore runbook (Supabase Pro daily backup or PITR add-on) once, and record the RTO/RPO.

```
# ci.yml — new job (read-only; needs SUPABASE_ACCESS_TOKEN secret)
  db-drift:
    name: DB migration drift check
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: "2.x" }
      - name: Check repo vs prod schema_migrations
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
        run: |
          supabase link --project-ref kjrwqagyeswwoxpjkcko
          # fails if a committed migration was never applied
          supabase db push --dry-run
          # surfaces remote-only versions (applied but not committed)
          supabase migration list | tee miglist.txt
          ! grep -E '^\s+\|' miglist.txt | grep -q 'Remote only' \
            || { echo 'DRIFT: remote-only migration versions'; exit 1; }
# make the prod deploy job `needs: [ci, db-drift]`
```

#### 🟠 H5 · Edge functions are outside CI/CD: manual npx deploys, no drift detection, deprecated functions still live
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/functions:1`
- **Issue:** The 7 in-repo edge functions (supabase/functions/: llm-proxy, email-ingest, email-send, project-export, schedule-assistant, stripe-billing, _shared) are deployed only by a human running `npx supabase functions deploy <name> --project-ref ...` with per-function verify_jwt flags held in prose (CLAUDE.md §16). CI's deploy job (ci.yml:125-159) ships only the frontend. Nothing detects when deployed function code drifts from the repo, and a change to _shared/* requires remembering to redeploy every importer. Additionally, two deprecated functions (sharepoint-proxy, bluebeam-proxy) whose source is no longer even in the repo remain deployed, and a dangling caller still POSTs the deleted stripe-worker every ~60s (404s in edge logs, per TECH_DEBT.md:26-65).
- **Impact:** A merged security fix to llm-proxy or stripe-billing (the Stripe webhook — the tamper-proof org.plan anchor) can sit undeployed indefinitely with a green CI badge; conversely a hotfix deployed live but never committed is silently lost on the next deploy. The _shared fan-out rule guarantees an eventual partial-deploy incident. Deployed-but-unversioned code (sharepoint-proxy/bluebeam-proxy) is unauditable attack surface.
- **Fix:** Add a CI job that deploys all edge functions on push to main when supabase/functions/** changed, encoding the verify_jwt flags in the workflow so they can't be fat-fingered; delete the two deprecated functions from the platform. This also fixes the _shared fan-out (deploy all importers every time).

```
# ci.yml — new job
  deploy-functions:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    concurrency: { group: edge-fn-deploy, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: "2.x" }
      - name: Deploy edge functions (verify_jwt encoded per fn)
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          REF: kjrwqagyeswwoxpjkcko
        run: |
          set -euo pipefail
          # own-auth / webhook functions: JWT verify OFF
          for fn in llm-proxy email-ingest stripe-billing; do
            supabase functions deploy "$fn" --project-ref "$REF" --no-verify-jwt
          done
          # platform JWT verify ON
          for fn in email-send project-export schedule-assistant; do
            supabase functions deploy "$fn" --project-ref "$REF"
          done
# One-time cleanup (manual):
#   npx supabase functions delete sharepoint-proxy --project-ref $REF
#   npx supabase functions delete bluebeam-proxy  --project-ref $REF
#   trace + stop the pg_cron/webhook caller still POSTing stripe-worker
```

#### 🟠 H6 · No branch protection on main: ~10 concurrent agents push directly, and any pusher can tamper with the deploy workflow / exfiltrate VERCEL_TOKEN
- **Severity:** high · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:130`
- **Issue:** The repo is private on a free GitHub plan, so branch protection / rulesets / required status checks are unavailable, and roughly 10 concurrent agent sessions push directly to main (coordination is a voluntary AGENT_CLAIMS.md convention). CI gates the *deploy*, but red or unreviewed code still lands on main as permanent history. Critically, anyone (or any compromised agent session) with push access can edit .github/workflows/ci.yml on main to add a step that echoes/exfiltrates secrets.VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID (ci.yml:130-132, 147-159) or to deploy arbitrary code — the sole-deploy-path guarantee only holds while the workflow file itself is trusted. Concrete evidence of the unreviewed-push failure mode is already committed: a Windows-scratchpad file with a mangled absolute path ('CUsersNicholas...contrast_check.js') and pro-pricing-live.png are tracked at the repo root on origin/main.
- **Impact:** A single bad agent push can silently redefine the production deploy pipeline or leak the Vercel token (full deploy control over steelbuild-pro.com). History rewrite / force-push is also unblocked at the platform level (only convention forbids it). Enterprise due diligence treats unprotected default branches with production deploy credentials as a failing control.
- **Fix:** Upgrade the GitHub org to Team (~$4/user/mo) and enable branch protection on main: require the 'Lint + Typecheck + Test + Build' status check, require PRs (agents merge via PR instead of direct push), block force-pushes/deletions. Until then, reduce blast radius: scope VERCEL_TOKEN to the single project (Vercel supports project-scoped tokens), set a GitHub Actions environment named 'production' holding the Vercel secrets (even without reviewers it centralizes/rotates them), and add a top-level least-privilege permissions block so the ambient GITHUB_TOKEN can't write.

```
# ci.yml — add at top level (defense-in-depth for GITHUB_TOKEN)
permissions:
  contents: read

# After plan upgrade (owner, one-time):
# gh api -X PUT repos/lorteezy87/SteelBuild-Pro-Rev.2/branches/main/protection \
#   --input - <<'JSON'
# {
#   "required_status_checks": {
#     "strict": true,
#     "checks": [{ "context": "Lint + Typecheck + Test + Build" }]
#   },
#   "enforce_admins": true,
#   "required_pull_request_reviews": null,
#   "restrictions": null,
#   "allow_force_pushes": false,
#   "allow_deletions": false
# }
JSON
```

#### 🟡 M8 · Production deploy job has no dedicated concurrency guard — a newer push cancels an in-flight prod deploy mid-command
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `.github/workflows/ci.yml:37`
- **Issue:** The workflow-level concurrency group `ci-${{ github.ref }}` with `cancel-in-progress: true` (ci.yml:37-39) applies to the whole run, including the deploy job. With ~10 agents pushing main, push B will regularly cancel push A's run while it is inside `vercel build`/`vercel deploy --prebuilt --prod` (ci.yml:151-159). Two consequences: (a) a deploy can be killed mid-flight (Vercel promotion is atomic so corruption is unlikely, but partial uploads waste minutes and can leave confusing half-created deployments), and (b) if the green run A is cancelled and run B then fails CI, the already-validated commit A never deploys — prod silently stays stale with no signal. The deploy job also has no timeout-minutes (default 360m), so a hung Vercel CLI call blocks the concurrency slot for 6 hours.
- **Impact:** Intermittent lost/stale deploys and mid-flight cancellations under exactly this repo's normal operating condition (rapid concurrent pushes to main). Debugging 'why isn't my green commit live?' costs real time.
- **Fix:** Keep cancel-in-progress for feature branches, but never cancel main runs; give the deploy job its own serialized, non-cancelling concurrency group and a timeout.

```
# ci.yml
concurrency:
  group: ci-${{ github.ref }}
  # cancel redundant runs on feature branches only; never on main
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  deploy:
    name: Deploy to Vercel (production)
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    concurrency:
      group: production-deploy   # serialize deploys, never cancel mid-flight
      cancel-in-progress: false
```

#### 🟡 M9 · Deploys are not traceable to a commit: no git metadata on Vercel CLI deploys and no per-deploy Sentry release
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `.github/workflows/ci.yml:151`
- **Issue:** Because production ships via `vercel deploy --prebuilt` (ci.yml:157) instead of git integration, the Vercel deployment record carries no commit SHA/branch unless passed via `--meta` — it is not. Sentry release association depends on VITE_APP_VERSION (src/instrument.js:31, vite.config.js:127), which is documented as optional (.env.example:13) and is never set by CI; if it exists at all it is a static Vercel env var, meaning every deploy reports the same stale release (TECH_DEBT.md references release 'b5272fd7', a months-old SHA). UNCONFIRMED: the current value of VITE_APP_VERSION in the Vercel production env cannot be read from the repo — but the CI wiring provably never stamps it per-commit.
- **Impact:** During an incident you cannot answer 'which commit is live?' from Vercel, and Sentry cannot answer 'which deploy introduced this error?' — regressions can't be bisected to a deploy, and source-map/release association degrades. This is the first thing an on-call engineer needs.
- **Fix:** Stamp the commit SHA into both systems from the deploy job: export VITE_APP_VERSION=$GITHUB_SHA for `vercel build` (Vite reads process env; the Sentry plugin then names the release with the SHA and instrument.js reports it), and pass --meta on `vercel deploy`.

```
# ci.yml deploy job
      - name: Build (production)
        run: vercel build --prod --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VITE_APP_VERSION: ${{ github.sha }}   # Sentry release == commit

      - name: Deploy prebuilt output (production)
        run: >
          vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN"
          --meta githubCommitSha=${{ github.sha }}
          --meta githubCommitRef=${{ github.ref_name }}
          --meta githubRunId=${{ github.run_id }}
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
# (optional) delete any static VITE_APP_VERSION from the Vercel
# project env so the per-deploy value is the only source.
```

#### 🟡 M10 · No post-deploy verification or failure alerting; E2E smoke is opt-in and observe-only with no notification channel
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:156`
- **Issue:** The deploy job ends at `vercel deploy` (ci.yml:156-159) with no health check that the deployed app actually serves. The e2e-smoke job (ci.yml:177-228) is well built but (a) only runs if the repo variable E2E_ENABLED is 'true' — UNCONFIRMED whether it has ever been enabled (the README's owner-setup steps at e2e/README.md:100-121 read as not-yet-done), and (b) is deliberately non-blocking with no alert hook, so a failing post-deploy smoke only surfaces if someone browses the Actions tab. There is no Slack/email/issue notification on deploy failure or smoke failure.
- **Impact:** A deploy that ships a white-screen (bad env pull, CDN misconfig, broken index.html rewrite) is only discovered by users. The 'unit tests pass != it works' layer the team explicitly built (fab-status cautionary tale) is currently dormant unless the variable was set.
- **Fix:** Add a cheap curl health check as the last deploy step (fails the run loudly), flip E2E_ENABLED=true with the documented test-account secrets, and add a notify-on-failure step (GitHub issue or Slack webhook) to both deploy and e2e-smoke.

```
# ci.yml deploy job — after the deploy step
      - name: Post-deploy health check
        run: |
          set -e
          for i in 1 2 3 4 5; do
            code=$(curl -s -o /dev/null -w '%{http_code}' \
              https://steelbuild-pro.com/)
            [ "$code" = "200" ] && { echo "healthy ($code)"; exit 0; }
            echo "attempt $i: HTTP $code"; sleep 10
          done
          echo '::error::production health check failed'; exit 1

      - name: Alert on failure
        if: failure()
        env: { GH_TOKEN: ${{ github.token }} }
        run: |
          gh issue create -R "$GITHUB_REPOSITORY" \
            --title "PROD DEPLOY FAILED: $GITHUB_SHA" \
            --body "Run: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
# needs `permissions: issues: write` on the job + owner step:
# set repo variable E2E_ENABLED=true and the E2E_* secrets (e2e/README.md)
```

#### 🟡 M11 · Supply-chain gaps: tag-pinned actions, floating vercel@latest CLI, vercel build not forced to npm ci, no dependabot
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `.github/workflows/ci.yml:144`
- **Issue:** All GitHub Actions are pinned by mutable tag, not commit SHA (actions/checkout@v4 at ci.yml:56/135/185, actions/setup-node@v4 at 59/138/188, actions/upload-artifact@v4 at 223). The deploy job installs `npm i -g vercel@latest` (ci.yml:144), so the exact tool that receives VERCEL_TOKEN and ships prod floats on whatever npm serves that day — both a compromise vector and a reproducibility risk (a breaking Vercel CLI release bricks deploys). `vercel build` uses Vercel's default install (npm install) rather than the lockfile-strict npm ci because vercel.json (line 2) sets buildCommand but no installCommand. There is no .github/dependabot.yml (confirmed: .github/ contains only workflows/), so neither npm deps nor action versions get automated update PRs; no SBOM/provenance is produced.
- **Impact:** A hijacked action tag or malicious vercel CLI release executes with production deploy credentials. Unpinned tooling also makes deploy failures non-reproducible. npm audit is clean today but nothing keeps it that way.
- **Fix:** Pin actions to full commit SHAs (dependabot keeps them fresh), pin the Vercel CLI to an exact version, set installCommand to npm ci in vercel.json, and add dependabot for npm + github-actions ecosystems.

```
# ci.yml (repeat pattern for every `uses:`)
      - uses: actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
# deploy job
      - name: Install Vercel CLI (pinned)
        run: npm i -g vercel@39.3.0   # bump deliberately, not implicitly

# vercel.json
{
  "installCommand": "npm ci",
  "buildCommand": "npm run build"
}

# .github/dependabot.yml (new file)
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule: { interval: "weekly" }
  - package-ecosystem: "npm"
    directory: "/"
    schedule: { interval: "weekly" }
    open-pull-requests-limit: 5
```

#### 🟡 M12 · VERCEL_TOKEN scope and rotation are ungoverned; no least-privilege permissions block on the workflow
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:147`
- **Issue:** The production deploy authenticates with a long-lived personal VERCEL_TOKEN repo secret (ci.yml:147-159). UNCONFIRMED: the token's scope cannot be read from the repo, but Vercel personal tokens default to full-account scope (all projects, domains, env vars — including reading VITE_SUPABASE_* and SENTRY_AUTH_TOKEN from project env), and no rotation schedule or procedure is documented anywhere in the repo (no mention in TECH_DEBT.md, docs/, or ARCHITECTURE.md). The workflow also declares no top-level `permissions:` block, so the ambient GITHUB_TOKEN gets the repo-default permission set on every run.
- **Impact:** If the token leaks (workflow tampering — see the branch-protection finding — a compromised runner, or an agent accidentally echoing env), the attacker controls the entire Vercel account, not just this project's deploys, and can read every production secret stored in Vercel env. Stale never-rotated credentials are a standard audit finding.
- **Fix:** Recreate the token scoped to the specific Vercel team/project with the shortest practical expiry, document a rotation cadence (e.g., 90 days) in TECH_DEBT.md or a SECURITY-OPS doc, and add `permissions: contents: read` at the top of ci.yml. Consider moving deploy secrets into a GitHub Actions 'production' environment for central management.

```
# ci.yml — top level, under `concurrency:`
permissions:
  contents: read

# Owner steps (Vercel dashboard):
# 1. Account Settings -> Tokens -> create token,
#    Scope: the team owning `steelbuildpro-og` only,
#    Expiration: 90 days.
# 2. Update repo secret VERCEL_TOKEN; delete the old token.
# 3. Calendar a rotation (or re-issue on each expiry).
```

#### ⚪ L13 · No secret-scanning, SAST, or dependency-audit step in CI (Sonar config exists only as an uncommitted local file)
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `.github/workflows/ci.yml:41`
- **Issue:** The pipeline runs lint/typecheck/test/build but no security scanning: no gitleaks/trufflehog secret scan, no `npm audit --audit-level=high` gate, no CodeQL (GitHub Advanced Security is unavailable on the free private plan). A sonar-project.properties exists as an untracked file in the owner's local checkout but is NOT on origin/main (verified absent from the worktree), so whatever Sonar setup it represents is not part of the repo or pipeline.
- **Impact:** A committed credential (the repo has live Stripe sk_live usage and multiple provider tokens in its operational orbit) or a newly-disclosed dependency CVE would not be caught by the pipeline — only by luck. Enterprise questionnaires ask specifically for these controls.
- **Fix:** Add a gitleaks job (free for this use) and an npm audit gate to ci.yml; commit the Sonar config if Sonar is actually in use, otherwise delete it locally.

```
# ci.yml — new independent job
  security-scan:
    name: Secrets + dependency audit
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # scan full history
      - name: Gitleaks secret scan
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Dependency audit (fail on high+)
        run: npm audit --omit=dev --audit-level=high
```

#### ⚪ L14 · Stale ignoreCommand lingers in vercel.json and suppresses preview deployments
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `vercel.json:6`
- **Issue:** vercel.json line 6 still carries `"ignoreCommand": "if [ \"$VERCEL_ENV\" = \"preview\" ]; then exit 0; else exit 1; fi"`. Under Vercel semantics exit 0 = skip the build, so this actively skips ALL git-triggered preview builds while 'proceeding' for production builds that are already disabled by `git.deploymentEnabled.main=false` (line 5). CLAUDE.md §8 explicitly records that an in-repo ignoreCommand gate 'ERRORS the Vercel deploy — do NOT reintroduce it', yet one is still present; it is inert for the CLI --prebuilt path but is exactly the foot-gun the project's own docs warn about, and it kills the cheapest available pre-prod validation (preview URLs) on both Vercel projects wired to this repo.
- **Impact:** No preview deployments exist for any branch, removing a free staging-lite capability; and a future re-enable of git deploys would interact with this leftover in the documented deploy-erroring way.
- **Fix:** Delete the ignoreCommand key from vercel.json (keep git.deploymentEnabled.main=false as the sole production off-switch), restoring branch preview deploys.

```
// vercel.json — remove line 6
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "git": { "deploymentEnabled": { "main": false } },
  // ignoreCommand DELETED — previews build again;
  // prod stays CLI-only via the disabled git deploy above
  ...
}
```

#### ⚪ L15 · Repo/docs drift from the unreviewed-push workflow: junk files tracked on main and a stale TECH_DEBT claim about the deploy gate
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `TECH_DEBT.md:118`
- **Issue:** Two artifacts of direct-to-main pushes are tracked at the repo root on origin/main (verified via git ls-files): a Windows scratchpad file with a mangled absolute path ('CUsersNicholasAppDataLocalTempclaude...scratchpadcontrast_check.js' — contains the U+F03A NTFS-mapped colon, which risks checkout errors on some toolchains) and pro-pricing-live.png (a screenshot). Separately, TECH_DEBT.md:118-123 still states 'CI is advisory on the deploy path... a red run on main does not stop the direct-push Vercel deploy', which has been false since the 2026-06-19 CI-gated deploy cutover (ci.yml:118-128 + vercel.json:5) — an auditor or new engineer reading TECH_DEBT would conclude the deploy gate doesn't exist.
- **Impact:** Cosmetic but visible: junk files in the root of a repo shown to enterprise customers/auditors, a potential cross-platform checkout failure, and an ops doc that misstates the single most important deploy control.
- **Fix:** git rm the two stray files; rewrite the TECH_DEBT.md bullet to describe the current control (CI-gated sole deploy path; remaining gap = branch protection only).

```
git rm "C$''UsersNicholasAppDataLocalTempclaudeC--dev-SteelBuild-Pro-Rev-24f9dab6f-25e4-4b7a-8b0e-0f15db6950e9scratchpadcontrast_check.js" pro-pricing-live.png
# TECH_DEBT.md — replace the 'CI is advisory' bullet with:
# - CI gates the production deploy (ci.yml deploy job is the sole
#   path; vercel.json git auto-deploy off). Remaining gap: no
#   branch protection (free plan), so red/unreviewed commits still
#   land on main even though they cannot deploy.
```

### Observability & error handling

The client-side error capture foundation is genuinely solid: Sentry is initialized first (masked replay, tuned sampling, PII-off defaults), both ErrorBoundaries and global window handlers report with useful tags, source-map upload is correctly wired-but-gated, and the codebase is remarkably clean of console noise. The readiness gap is everything AFTER capture: no Sentry alert rules are configured (the repo's own handoff doc says "Error capture is live; alerting is not"), there is no uptime monitoring, healthcheck, or status page, and the six production edge functions — including the Stripe and email webhooks that fail machine-to-machine with no user to notice — log only to short-retention Supabase console logs with zero error tracking. Release tagging and source-map upload are very likely inactive in practice (VITE_APP_VERSION is only a commented-out example; SENTRY_AUTH_TOKEN status unconfirmed), so production stack traces are probably minified. Audit logging is centralized and now append-only, but two known tier-1 gaps are confirmed on this tree (drawing-set approval, project member/role changes) and actor attribution is a forgeable free-text name rather than auth.uid(). Net: a competent monitoring stack that currently pages no one — most fixes are hours, not weeks, and several are dashboard/vendor actions rather than code.

**Strengths:**
- Sentry init is correct and privacy-conscious: imported first in src/main.jsx, masked session replay (maskAllText+blockAllMedia), sendDefaultPii:false, sane sample rates (10% traces/sessions, 100% error sessions), env tagging, and a documented deliberate exclusion of *.supabase.co from trace propagation to avoid CORS breakage (src/instrument.js).
- Two-tier ErrorBoundary coverage (top-level src/components/ErrorBoundary.jsx + per-route/section src/components/shared/ErrorBoundary.jsx), both reporting to Sentry with componentStack and boundary tags, plus global window.error/unhandledrejection handlers (src/main.jsx:42-49) and a scrubbed local ring buffer (src/lib/telemetry.js) for in-field devtools debugging without double-reporting.
- Source-map pipeline is safely designed: @sentry/vite-plugin runs only when SENTRY_AUTH_TOKEN is present, emits hidden maps, deletes them after upload, and swallows upload errors so a Sentry outage can never fail a deploy (vite.config.js:117-140).
- llm_telemetry gives real per-call LLM observability (provider, model, latency, cost, success/failure) with fail-safe best-effort inserts, plus operational spend controls (per-user quota, model allowlist, kill switch) in supabase/functions/llm-proxy.
- Audit trail hardening is real: activities was made append-only on 2026-06-30 (supabase/migrations/20260630040350_activities_append_only.sql), matching fab_release_log/ai_audit_log, and useCrudMutation centralizes audit writes and never swallows mutation errors (toast + throw).
- Zero console.log statements in src/ (verified by search) — production console is clean; edge functions use consistent [function-name]-prefixed logging with truncated detail strings that avoid dumping documents/PII.
- Stripe webhook error handling is retry-safe: 500 on handler failure with the idempotency marker written only after success, so Stripe's retry loop is the recovery mechanism (supabase/functions/stripe-billing/index.ts:137-153).
- CSP Report-Only header reports violations to the Sentry security endpoint (vercel.json:22) — violation telemetry exists before enforcement is turned on.


#### 🟠 H7 · No uptime monitoring, healthcheck endpoint, or status page
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `vercel.json:41`
- **Issue:** The app is a pure SPA — vercel.json:41 rewrites every path to index.html, so there is no /health or /api/health that verifies anything beyond static-file serving. No edge function exposes a health route, no synthetic monitor (UptimeRobot/Pingdom/Checkly/Sentry Uptime) is referenced anywhere in the repo, and there is no status page. The handoff doc lists an uptime check as an optional TODO (docs/HANDOFF-2026-06-22-gtm-batch.md:25). The composite failure mode is real and has precedent: Supabase storage-cap exhaustion once blocked production login while Vercel kept serving the (green) static shell.
- **Impact:** A full or partial outage — Supabase paused, PostgREST down, auth broken, edge functions failing — is undetectable by the operator until a customer reports it. Enterprise buyers routinely require uptime SLAs, a status page, and evidence of synthetic monitoring during vendor review; none exist.
- **Fix:** Add a lightweight health edge function that checks PostgREST + Auth reachability, point an external monitor (UptimeRobot/Checkly/Sentry Uptime — free tiers suffice) at both https://steelbuild-pro.com and the health function, alerting to email/SMS. Stand up a simple status page (Instatus/BetterStack free tier) for customer-facing incident comms.

```
// supabase/functions/health/index.ts  (deploy with --no-verify-jwt)
Deno.serve(async () => {
  const checks: Record<string, boolean> = {};
  const base = Deno.env.get("SUPABASE_URL") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  try {
    const r = await fetch(`${base}/rest/v1/?apikey=${anon}`, { method: "HEAD" });
    checks.postgrest = r.status < 500;
  } catch { checks.postgrest = false; }
  try {
    const r = await fetch(`${base}/auth/v1/health`, { headers: { apikey: anon } });
    checks.auth = r.ok;
  } catch { checks.auth = false; }
  const ok = Object.values(checks).every(Boolean);
  return new Response(JSON.stringify({ ok, checks, ts: new Date().toISOString() }), {
    status: ok ? 200 : 503,
    headers: { "content-type": "application/json" },
  });
});
```

#### 🟠 H8 · Sentry release tagging and source-map upload are almost certainly inactive in production
- **Severity:** high · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `src/instrument.js:31`
- **Issue:** src/instrument.js:31 sets release from VITE_APP_VERSION, but that variable exists only as a commented-out example (.env.example:13) and is set nowhere in CI (.github/workflows/ci.yml deploy job) — so unless it was manually added in the Vercel dashboard, every prod event has no release. Source-map upload (vite.config.js:37-38, 117-140) runs only when SENTRY_AUTH_TOKEN is in the build env; UNCONFIRMED: whether that token is actually set in the Vercel project env — the instrument.js header comment (lines 18-19) still describes source maps as a pending "Follow-up," suggesting it is not. Additionally environment uses import.meta.env.MODE, so any preview build would also report as "production", mixing environments. The manual window.__SBP_BUILD__ fingerprint (src/main.jsx:18) is not fed to Sentry.
- **Impact:** Production stack traces are minified and unreadable (the app builds without sourcemaps when the token is absent), making incident debugging slow and error-grouping noisy. Without releases, Sentry cannot answer "which deploy introduced this" or mark regressions — the first question in any incident review.
- **Fix:** Create a SENTRY_AUTH_TOKEN (org-scoped, project:releases + org:read) and set it in the Vercel project env (production). Export VITE_APP_VERSION from the git SHA in the CI deploy job so both the runtime init and the vite plugin share one release name. Distinguish preview vs production via VITE_VERCEL_ENV or an explicit env var. Update the stale instrument.js comment.

```
# .github/workflows/ci.yml — deploy job, replace the Build step
      - name: Build (production)
        run: |
          export VITE_APP_VERSION="${GITHUB_SHA::8}"
          vercel build --prod --token="$VERCEL_TOKEN"
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}

# (also add SENTRY_AUTH_TOKEN as a GitHub repo secret and/or Vercel env var)
```

#### 🟡 M13 · Edge functions have zero error tracking or alerting — webhook failures are invisible
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/llm-proxy/index.ts:492`
- **Issue:** All six deployed edge functions (llm-proxy, schedule-assistant, email-ingest, email-send, project-export, stripe-billing) handle errors only via console.error to Supabase's dashboard log explorer (e.g. supabase/functions/llm-proxy/index.ts:492, email-ingest/index.ts:905, stripe-billing/index.ts:140). No Sentry Deno SDK, no log drain, no alerting. Supabase edge log retention is short (1 day free / 7 days Pro), so failures age out before anyone looks. This is worst for the machine-to-machine paths: email-ingest (Power Automate webhook) and stripe-billing /webhook have no human user to notice a failure — a broken email pipeline or a subscription-state update failing repeatedly would go completely unnoticed. llm_telemetry records LLM failures as rows but nothing monitors or alerts on them.
- **Impact:** A prod edge outage (bad deploy, expired provider key, quota misconfig, CORS regression — which has broken prod AI once before) surfaces only when a user reports "AI doesn't work" or an org's billing state drifts from Stripe. Billing-webhook failures can silently leave orgs on the wrong plan.
- **Fix:** Add a shared Sentry Deno init in supabase/functions/_shared/sentry.ts and call captureException + flush in every function's top-level catch (redeploy all importers). Alternatively/additionally configure a Supabase log drain (Datadog/Logflare) with an alert on error-level lines. Also add a scheduled check (pg_cron or GitHub Actions cron) that alerts when llm_telemetry failure rate spikes or email-ingest inserts stop.

```
// supabase/functions/_shared/sentry.ts
import * as Sentry from "npm:@sentry/deno";

Sentry.init({
  dsn: Deno.env.get("EDGE_SENTRY_DSN") ?? "", // set via `supabase secrets set`
  environment: "production",
  tracesSampleRate: 0,
});

export async function reportError(err: unknown, fn: string, extra?: Record<string, unknown>) {
  console.error(`[${fn}]`, err); // keep the Supabase log line
  try {
    Sentry.captureException(err, { tags: { edge_function: fn }, extra });
    await Sentry.flush(2000); // edge runtime may freeze after response
  } catch { /* never fail the request on telemetry */ }
}

// in each function's top-level catch, e.g. llm-proxy/index.ts:
//   } catch (err) {
//     await reportError(err, "llm-proxy", { useCase });
//     return json({ error: "internal error" }, 500);
//   }
```

#### 🟡 M14 · Audit attribution is forgeable free text, not an authenticated user id
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `src/services/auditLogger.ts:143`
- **Issue:** activities.performed_by is a plain text column (supabase/migrations/20260101000010_baseline_schema.sql:2317) populated client-side from user_metadata.full_name/email with a spoofable localStorage fallback (src/services/auditLogger.ts:88-105, 143). There is no actor user-id column, and the INSERT policy (baseline_schema.sql:9660) only requires project membership — so any project member can insert audit rows attributed to any name, and legitimate rows cannot be reliably joined to auth.users (name collisions, renames, email changes).
- **Impact:** The audit trail cannot prove WHO performed an action — the property that makes an audit trail useful in a backcharge dispute, a compliance review, or a security investigation. Append-only hardening (shipped 2026-06-30) protects rows from tampering after insert, but the actor field itself is untrustworthy at insert time.
- **Fix:** Add a performed_by_user_id uuid column enforced server-side via a BEFORE INSERT trigger that stamps auth.uid() regardless of payload; keep performed_by as display-only. Backfill is not possible for old rows — document the cutover date.

```
alter table public.activities
  add column if not exists performed_by_user_id uuid;

create or replace function public.activities_stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.performed_by_user_id := auth.uid();  -- ignore any client-supplied value
  return new;
end $$;

drop trigger if exists trg_activities_actor on public.activities;
create trigger trg_activities_actor
  before insert on public.activities
  for each row execute function public.activities_stamp_actor();

notify pgrst, 'reload schema';
```

#### 🟡 M15 · No beforeSend PII scrubbing and no user/org context on Sentry events
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `src/instrument.js:28`
- **Issue:** Sentry.init (src/instrument.js:28-59) has no beforeSend or beforeBreadcrumb. Replay masking and sendDefaultPii:false are good, but they do not cover: (a) default fetch/XHR breadcrumbs, which record full Supabase REST URLs whose query strings can embed filter values (emails, search text, entity names); (b) captured error messages — Postgres/PostgREST errors can include row values (e.g. unique-violation "Key (email)=(x@y.com) already exists"). Conversely, no Sentry.setUser/setTag is ever called (confirmed repo-wide), so events carry no user or org/tenant identifier — the init comment itself (line 33-35) acknowledges this as the intended future mechanism.
- **Impact:** Two-sided gap: project/financial strings can leak into a third-party processor (a problem for the DPA/subprocessor story an enterprise buyer will scrutinize), while support cannot answer "is tenant X affected by this error?" — per-org impact assessment during an incident requires guessing.
- **Fix:** Add beforeSend/beforeBreadcrumb that strip query strings from URLs and truncate DB error details; call Sentry.setUser({ id }) + setTag('org_id', …) with opaque UUIDs (no email) on login and clear on logout in AuthContext.

```
// src/instrument.js — add to Sentry.init options:
beforeSend(event) {
  if (event.request?.url) event.request.url = event.request.url.split("?")[0];
  // Postgres unique-violation details can embed row values
  for (const v of event.exception?.values ?? []) {
    if (v.value) v.value = v.value.replace(/Key \(.+?\)=\(.+?\)/g, "Key (…)=(…)");
  }
  return event;
},
beforeBreadcrumb(crumb) {
  if ((crumb.category === "fetch" || crumb.category === "xhr") && crumb.data?.url) {
    crumb.data.url = String(crumb.data.url).split("?")[0];
  }
  return crumb;
},

// src/lib/AuthContext.tsx — after session resolves (opaque ids only):
import { Sentry } from "@/instrument";
Sentry.setUser(user ? { id: user.id } : null);
```

#### 🟡 M16 · Background refetch failures are silently swallowed — stale data with no signal
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `src/lib/query-client.ts:5`
- **Issue:** src/lib/query-client.ts:5-26 configures the QueryClient with no QueryCache/MutationCache onError. When a query has succeeded once and a background refetch then fails (expired session, network drop, RLS change, Supabase blip), React Query keeps serving cached data, error state is only visible to pages that explicitly render query.error, and nothing is toasted or reported to Sentry. Mutations are covered only where pages use useCrudMutation or hand-rolled onError — refetch-path errors have no global net at all.
- **Impact:** A PM can sit on stale financials, schedule, or approval status without any indication the app has stopped refreshing — for a construction-controls product, silently stale data is a correctness problem, and the operator gets no telemetry that refetches are failing fleet-wide.
- **Fix:** Add a QueryCache onError that (a) reports to Sentry with the query key and (b) toasts once (deduped) when a background refetch fails for data already on screen.

```
// src/lib/query-client.ts
import { QueryCache, QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';

let lastToastAt = 0;
export const queryClientInstance = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      Sentry.captureException(error, {
        tags: { source: 'react-query-refetch' },
        contexts: { query: { key: JSON.stringify(query.queryKey) } },
      });
      // Background failure over existing data → user sees stale data; say so (deduped).
      if (query.state.data !== undefined && Date.now() - lastToastAt > 30_000) {
        lastToastAt = Date.now();
        toast.error('Data refresh failed — showing last loaded data.');
      }
    },
  }),
  defaultOptions: { /* …existing retry/staleTime options unchanged… */ },
});
```

#### ⚪ L16 · Audit trail misses drawing-set approval and project member/role changes (confirmed on this tree)
- **Severity:** low · **Effort:** M · CONFIRMED
- **Location:** `src/pages/Drawings.jsx:590`
- **Issue:** Two tier-1 mutations write no activities row: (1) drawing-set approval status — handleSetApproval in src/pages/Drawings.jsx:590-644 updates drawing_sets.set_approval_status and mirrors per-sheet, with no logActivity/logTransition call; (2) project membership — src/pages/ProjectMembers.jsx mutates user_projects (role change line 180, removal line 191, bulk role line 207, invite/create line 245) with no audit call; org-level member management (OrgMembers.jsx) is likewise unaudited. A repo-wide search confirms neither file imports auditLogger.
- **Impact:** Access-control changes (who was granted pm/admin, who was removed) and document-approval state changes are exactly the events enterprise auditors and dispute resolution ask for ("who approved this set and when", "who added this user"). Currently unanswerable from the audit trail; approval history is only inferable from mutable row state.
- **Fix:** Call logActivity/logTransition from the mutation success paths in both files (mirroring the FabRelease/Deliveries pattern already used for other tier-1 mutations). Longer-term, consider DB triggers on user_projects so grants are audited regardless of client path.

```
// Drawings.jsx — inside handleSetApproval, after the batchProcess succeeds:
import { logTransition } from "@/services/auditLogger";
const prev = approvalSet.sheets[0]?.set_approval_status || "unknown";
logTransition("drawing", { id: parentSetId, name: approvalSet.setName }, prev, status, {
  projectId,
  description: `Set "${approvalSet.setName}" approval: ${prev} → ${status}`,
});

// ProjectMembers.jsx — in the role-change mutation onSuccess:
import { logActivity } from "@/services/auditLogger";
logActivity("project", "member_role_changed", { id: projectId }, {
  projectId,
  description: `${memberEmail}: ${previousRole} → ${role}`,
});
// (repeat for member added / removed)
```

#### ⚪ L17 · Audit-write failures are invisible (console.warn only)
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/services/auditLogger.ts:156`
- **Issue:** logActivity is fire-and-forget: any insert failure (RLS rejection, schema drift, network) is reduced to console.warn (src/services/auditLogger.ts:156) with no Sentry report, counter, or retry. If a policy or column change ever breaks activity inserts, the audit trail silently stops recording while every primary operation keeps succeeding.
- **Impact:** Silent audit-coverage decay: the operator would not learn the trail went dark until an investigation needs records that were never written — an awkward finding in a compliance or dispute context.
- **Fix:** Report audit-write failures to Sentry (rate-limited) so a systemic break pages someone, while keeping the primary operation unblocked.

```
// src/services/auditLogger.ts — in the catch block:
import * as Sentry from "@sentry/react";
} catch (err: any) {
  console.warn("[auditLogger] Failed to log activity:", err?.message);
  Sentry.captureMessage("audit write failed", {
    level: "warning",
    tags: { entityType, action },
    extra: { message: err?.message },
  });
}
```

#### ⚪ L18 · Dangling stripe-worker caller pollutes edge logs with 404s (~every 60s)
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Issue:** UNCONFIRMED: not verifiable from the repo (the orphan stripe-worker function was deleted), but per the project's own operating notes (CLAUDE.md §16) a leftover caller — likely pg_cron or an external scheduler — still POSTs the deleted stripe-worker endpoint roughly every 60 seconds, producing a continuous 404 stream in the Supabase edge logs.
- **Impact:** Constant 404 noise trains the operator to ignore the edge log stream and inflates any future error-rate alerting baseline (finding #2), masking real failures.
- **Fix:** In the Supabase dashboard/SQL editor, list scheduled jobs (select * from cron.job;) and unschedule the stripe-worker POST; also check any external scheduler (Power Automate, GitHub cron). Verify the 404s stop in the edge log explorer.

### Performance & scalability

The app has genuinely good performance hygiene at the framework layer: 85 lazy routes, a deliberate and well-documented Vite vendor-chunk strategy, three/web-ifc correctly lazy-loaded behind the viewer_3d flag, a centralized query-key registry (no invalidate-everything patterns), clean per-project realtime channels with unmount cleanup, and a database whose RLS policies are almost entirely initplan-clean (the live advisor found only ONE auth_rls_initplan lint and only one unindexed FK, in Stripe's managed schema). The dominant enterprise-scale risk is the data-fetch architecture: every screen is 'fetch the table client-side, then filter in JS'. Portfolio surfaces split into two failure modes — CommandCenter/AIInsights page through entire cross-project tables uncapped (up to 100k rows each via listAll), while ~30 report pages, ExecutiveView, and global search use bare list() calls that silently truncate at 2,000 rows in production, meaning financial KPIs and search results go quietly wrong as a tenant grows. Secondary gaps: no server-side pagination or list virtualization on core workflow pages (only DeliveriesList virtualizes), nav badges refetch full row sets every 120s just to count, bulk actions issue one HTTP round-trip per row, and the live advisor flags duplicate permissive SELECT policies on four hot tables. None of these are architecture rewrites — the entity layer already centralizes reads, so server-side aggregation/pagination can be introduced incrementally at one chokepoint.

**Strengths:**
- Live Supabase advisor is nearly clean on the hard stuff: only 1 auth_rls_initplan lint in the entire database (public.demo_requests) — every other RLS policy already uses the (select auth.uid()) initplan pattern — and only 1 unindexed foreign key, in Stripe's vendor-managed schema; public-schema FK indexing is complete.
- Centralized data layer (src/api/supabaseClient.ts): explicit LIST_ROW_CAP=2000 default on list()/filter() (src/api/supabaseClient.ts:355), a dev truncation warning (line 360), and a listAll() that pages with a stable id tiebreaker and a 100k safety ceiling (lines 406-428) — one chokepoint where server-side pagination can later be introduced app-wide.
- ListTruncationNotice pattern (src/components/shared/ListTruncationNotice.jsx) promotes silent truncation to a visible production notice, with a sync test against LIST_ROW_CAP; already live on 7 core pages (Drawings, Deliveries, Schedule, WorkPackages, SOV, Expenses, ChangeOrders).
- Bundle discipline is excellent: 85 lazy routes via lazyWithRetry (src/config/routes.js), and vite.config.js manualChunks with documented rationale — pdfjs isolated, recharts kept off chart-free routes via the clsx bridge-break, the Vite preload helper pinned so no heavy lib rides the boot path; three.js and web-ifc load only inside the lazy IfcModelViewer chunk (src/components/viewer3d/Model3DTab.jsx:24, src/lib/ifc/ifcEngine.js:14), verified no static import path from the Hub.
- cacheRegistry.ts is a real invalidation registry (60+ entities, exact key families, unit-tested) — no blanket invalidateQueries() / queryClient.clear() patterns found in mutation paths.
- Realtime hygiene (src/hooks/useRealtimeInvalidation.ts): one channel per table+project with project_id server-side filter, removeChannel cleanup on unmount, and a ref-based queryKeys pattern that explicitly avoids channel churn on re-render.
- Sane React Query defaults (src/lib/query-client.ts): refetchOnWindowFocus off, 30s staleTime, single retry that skips 400/404, never auto-retry mutations.
- Vitest deliberately runs pure-helper tests in node env for speed; project-scoped hot pages (Drawings, Submittals, RFIs, Hub) all filter by project_id server-side rather than fetching the whole tenant.


#### 🟠 H9 · CommandCenter and AIInsights pull entire cross-project tables to the browser via listAll() (uncapped to 100k rows per table)
- **Severity:** high · **Effort:** L · CONFIRMED
- **Location:** `src/pages/CommandCenter.jsx:135`
- **Issue:** src/pages/CommandCenter.jsx:135-201 issues ~10 parallel entities.X.listAll() reads (projects, RFIs, drawings, drawing sets, change orders, deliveries, work packages, SOV items, production notes, schedule tasks) and src/pages/AIInsights.jsx:200-207 issues 8 more. listAll() (src/api/supabaseClient.ts:406-428) deliberately pages past the 2,000-row cap up to a 100,000-row safety ceiling, selecting all columns ('*'), and every KPI/urgency rollup is computed client-side.
- **Impact:** At enterprise volume (e.g. 30 active projects x 3-5k drawing sheets + schedule tasks), the portfolio Command Center transfers tens of MB and hundreds of thousands of rows on every load (staleTime 30-60s, so effectively every visit), pinning the DB with dozens of sequential 1,000-row range reads per table and freezing low-end field devices during the client-side derive. This is the page an enterprise exec opens first.
- **Fix:** Move portfolio rollups server-side: create a Postgres view or RPC per dashboard (e.g. portfolio_kpis(org_id) returning per-project counts/sums computed in SQL under RLS), and have CommandCenter/AIInsights query the aggregate instead of raw tables. Keep listAll() only for per-project drill-downs and the data-export path. Interim mitigation: select only the columns each rollup needs instead of '*'.

```
-- migration: portfolio rollup view (RLS-safe: security_invoker)
create or replace view portfolio_project_kpis
with (security_invoker = on) as
select p.id as project_id, p.name,
  count(distinct r.id) filter (where r.status not in ('Answered','Closed')) as open_rfis,
  count(distinct d.id) filter (where d.due_date < now() and d.stage <> 'Released') as overdue_drawings,
  count(distinct wp.id) as work_packages
from projects p
left join rfis r on r.project_id = p.id and r.is_deleted = false
left join drawings d on d.project_id = p.id and d.is_deleted = false
left join work_packages wp on wp.project_id = p.id and wp.is_deleted = false
where p.is_deleted = false and p.on_hold = false
group by p.id, p.name;
-- client: one query replaces ~10 listAll() table scans
const { data } = await supabase.from('portfolio_project_kpis').select('*');
```

#### 🟠 H10 · Portfolio reports, executive dashboards, and global search silently truncate at 2,000 rows in production — financial KPIs and search results go quietly wrong at scale
- **Severity:** high · **Effort:** M · CONFIRMED
- **Location:** `src/pages/reports/FinancialKPIs.jsx:128`
- **Issue:** ~30 report pages plus ExecutiveView, Projects.jsx, ExecutiveDashboard, and GlobalSearchModal use bare entities.X.list() calls that cap at LIST_ROW_CAP=2000 (src/api/supabaseClient.ts:355,393) with only a DEV-mode console warning (line 360-367). Examples: src/pages/reports/FinancialKPIs.jsx:128-129 computes financial KPIs from entities.Expense.list(); src/pages/reports/PortfolioOverview.jsx:358-380 does 9 such reads; src/components/search/GlobalSearchModal.jsx:73-111 fetches 6 whole org-wide tables (projects/RFIs/drawings/WPs/COs/contacts) per modal open and searches client-side. The ListTruncationNotice mitigation exists but is wired into only 7 pages — none of the reports, ExecutiveView, or global search.
- **Impact:** Once a tenant crosses 2,000 rows in any of these tables (drawings and expenses will cross first — a handful of real steel jobs), executive financial reports show silently-undercounted totals with no user-visible signal, and global search silently misses matches beyond the first 2,000 rows per table. Silently-wrong financial numbers are the kind of defect an enterprise buyer treats as disqualifying.
- **Fix:** Three layers: (1) switch portfolio report rollups to SQL aggregates (same view/RPC approach as the CommandCenter finding) or at minimum listAll(); (2) replace GlobalSearchModal's fetch-everything with a server-side search (PostgREST .or(ilike) per table with a small limit, or a search RPC); (3) make the truncation signal fail loudly in production — render ListTruncationNotice on every list()-backed report and add a Sentry breadcrumb/captureMessage in warnIfTruncated so truncation is observable in prod, not just dev.

```
// supabaseClient.ts — make truncation observable in prod
import * as Sentry from '@sentry/react';
const warnIfTruncated = (tableName, op, count, cap) => {
  if (count >= cap) {
    if (import.meta.env.DEV) console.warn(`[supabaseClient] ${tableName}.${op}() truncated at ${cap}`);
    else Sentry.captureMessage(`list truncation: ${tableName}.${op} hit ${cap}-row cap`, 'warning');
  }
};
// GlobalSearchModal — server-side search instead of 6 full-table fetches
const { data } = await sbFrom('drawings')
  .select('id,sheet_number,title,project_id')
  .or(`sheet_number.ilike.%${q}%,title.ilike.%${q}%`)
  .limit(25);
```

#### 🟡 M17 · Advisor WARN: duplicate permissive SELECT policies on 4 hot tables (delivery_items, drawing_sheets, submittal_activity, task_dependencies)
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `supabase/migrations/20260620231716_i2_viewer_write_role_floor.sql:44`
- **Issue:** The live Supabase performance advisor reports 24 multiple_permissive_policies WARNs — 4 tables x 6 roles. Root cause is in supabase/migrations/20260620231716_i2_viewer_write_role_floor.sql:44-56 (and the parallel blocks for submittal_activity/task_dependencies): each table has a `<t>_read` FOR SELECT policy plus a `<t>_write` FOR ALL policy. FOR ALL includes SELECT, so every SELECT evaluates BOTH permissive policies per row; the policies are also `to public`, so anon/authenticator/dashboard_user get evaluated too. task_dependencies and delivery_items are hot read paths (Schedule/Gantt, Deliveries).
- **Impact:** Every row read on these tables pays double policy evaluation (including the delivery_items IN-subquery over deliveries twice). At enterprise row counts on schedule-heavy projects this measurably inflates Gantt and delivery reads, and the advisor will keep flagging it in every enterprise security/perf review a buyer runs.
- **Fix:** Split each _write FOR ALL policy into separate INSERT/UPDATE/DELETE policies so SELECT is governed by exactly one policy, and scope the policies to `authenticated` instead of `public`. Apply live via MCP and commit the same SQL as a migration.

```
-- repeat per table; shown for task_dependencies
drop policy if exists task_dependencies_write on public.task_dependencies;
create policy task_dependencies_insert on public.task_dependencies
  for insert to authenticated
  with check (user_has_project_role_at_least(project_id, 'field'));
create policy task_dependencies_update on public.task_dependencies
  for update to authenticated
  using (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));
create policy task_dependencies_delete on public.task_dependencies
  for delete to authenticated
  using (user_has_project_role_at_least(project_id, 'field'));
notify pgrst, 'reload schema';
```

#### 🟡 M18 · No server-side pagination and almost no list virtualization on core workflow screens; Submittals, RFIs, and the Detailing Hub lack even the truncation notice
- **Severity:** medium · **Effort:** L · CONFIRMED
- **Location:** `src/pages/Submittals.tsx:100`
- **Issue:** Core pages fetch up to 2,000 full-width rows per table in one shot and render them without windowing: src/hooks/useDrawings.ts:56 (explicit 2000), src/pages/Submittals.tsx:100-185 (7 parallel project-scoped reads at the default 2000 cap), src/pages/RFIs.jsx:123, src/pages/DrawingSubmittalHub.tsx:157-242. @tanstack/react-virtual is installed but used in exactly one component (src/components/deliveries/DeliveriesList.jsx); Drawings tables, Submittals lists, SOV, and ScheduleGantt render every row into the DOM. Submittals.tsx, RFIs.jsx, and DrawingSubmittalHub.tsx are also NOT among the 7 pages wired to ListTruncationNotice — a single project exceeding 2,000 submittal rows or sheets truncates with no user-visible signal on the moat pages themselves.
- **Impact:** A large steel job (3-5k sheets across revisions is realistic) hits both failure modes at once on the killer-workflow pages: multi-MB initial fetches with sluggish rendering/filtering on tablets, and — worse — sheets/submittals silently missing from the Hub and Submittals register beyond row 2,000.
- **Fix:** Short term: add ListTruncationNotice (count vs LIST_ROW_CAP) to Submittals.tsx, RFIs.jsx, and the Hub's register tab. Medium term: add a paginated read path to the entity layer (filter() already accepts limit; add offset/range + count:'exact') and adopt useVirtualizer for the drawing register and submittal tables, reusing the DeliveriesList implementation as the template.

```
// Submittals.tsx — minimal truncation guard (mirrors Drawings.jsx usage)
import ListTruncationNotice from '@/components/shared/ListTruncationNotice';
// under the filters bar:
<ListTruncationNotice count={submittals.length} label="submittals" />

// entity layer — paged read (add to createEntityClient)
filterPage: async (conditions, sortBy, { page = 0, pageSize = 200 } = {}) => {
  let q = sbFrom(tableName).select(projectScopedSelect(tableName), { count: 'exact' });
  q = applyLiveProjectScope(q, tableName);
  q = applyConditions(q, conditions);
  const s = parseSortBy(sortBy);
  q = s ? q.order(s.column, { ascending: s.ascending }) : q.order('created_at', { ascending: false });
  q = q.order('id').range(page * pageSize, (page + 1) * pageSize - 1);
  const { data, error, count } = await q;
  if (error) throw new SupabaseOperationError(tableName, 'filterPage', error);
  return { rows: addAliasesToList(data, tableName), total: count ?? 0 };
}
```

#### 🟡 M19 · Bulk actions issue one HTTP round-trip per row (Promise.all of per-id update/delete)
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `src/pages/SOV.jsx:261`
- **Issue:** Every bulk mutation fans out per-row requests instead of a set-based write: src/pages/SOV.jsx:261-282 (bulk delete / bulk status / bulk mark-100%), src/pages/EmailInbox.tsx:117, src/pages/DrawingSubmittalHub.tsx:625 (set due-date across all sheets in a package), src/pages/ScopeExclusions.jsx:105-121, src/hooks/useCostCodes.js:82-88, src/pages/ActionItems.jsx:152, and the chunked-but-still-per-row import modals (src/components/production/TeklaEpmImportModal.jsx:121, src/components/drawings/ModelElementImportModal.jsx:129).
- **Impact:** A bulk action over a few hundred rows (routine in steel workflows — mark an SOV complete, re-date a 300-sheet package) becomes hundreds of PATCH requests throttled by the browser's ~6-connection limit: multi-second UI stalls, partial-failure states mid-flight, and N realtime events amplifying into N cache-invalidation refetch cycles (see the realtime finding).
- **Fix:** Add a bulkUpdate(ids, patch) to the entity layer using a single .in('id', ids) UPDATE (RLS still applies per row), and route the bulk handlers through it. Keep per-row Promise.allSettled only where per-row payloads genuinely differ (the import modals), and chunk the .in() list at ~500 ids to stay under URL limits.

```
// supabaseClient.ts — add to createEntityClient
bulkUpdate: async (ids: string[], updates: Update<T>) => {
  const clean = cleanRecord(updates as Record<string, unknown>);
  delete clean.id; delete clean.created_at;
  const CHUNK = 500;
  const out: Array<RowWithAliases<T>> = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await sbFrom(tableName)
      .update({ ...clean, updated_at: new Date().toISOString() })
      .in('id', ids.slice(i, i + CHUNK))
      .select();
    if (error) throw new SupabaseOperationError(tableName, 'bulkUpdate', error);
    out.push(...addAliasesToList(data, tableName));
  }
  return out;
},
// SOV.jsx: mutationFn: ({ ids, status }) => entities.SOVItem.bulkUpdate(ids, { status })
```

#### ⚪ L19 · Supabase Auth server pinned to an absolute 10 DB connections (advisor: auth_db_connections_absolute)
- **Severity:** low · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `supabase/migrations:1`
- **Issue:** The live performance advisor reports: "Your project's Auth server is configured to use at most 10 connections. Increasing the instance size without manually adjusting this number will not improve the performance of the Auth server. Switch to a percentage based connection allocation strategy instead." This is an infrastructure setting, not visible in the repo.
- **Impact:** A login/token-refresh storm — an enterprise tenant onboarding a crew, or Monday-morning field logins — can exhaust the fixed 10-connection Auth pool and produce auth timeouts/failures even after upgrading the instance size, because the absolute cap doesn't scale with the instance.
- **Fix:** In the Supabase dashboard (Project Settings → Auth / database connection settings), change the Auth server's connection allocation from the absolute value (10) to the percentage-based strategy so it scales with compute upgrades. Re-run get_advisors afterwards to confirm the lint clears.

#### ⚪ L20 · Realtime invalidation has no debounce — bulk writes trigger one full invalidation/refetch cycle per row event
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/hooks/useRealtimeInvalidation.ts:50`
- **Issue:** src/hooks/useRealtimeInvalidation.ts:50-54 invalidates every registered query key on EVERY postgres_changes event. Combined with the per-row bulk mutations above, a 200-row bulk update on a subscribed table (schedule_tasks, work_packages, rfis, deliveries, email_messages, etc.) delivers ~200 events, each re-invalidating queries that fetch up to 2,000 rows — for every OTHER user currently viewing that page as well.
- **Impact:** Bulk operations by one user fan out into refetch storms on all connected clients of the same project: transient UI jank, duplicated 2,000-row fetches, and unnecessary DB read load that scales with (rows changed x connected users).
- **Fix:** Coalesce invalidations with a short trailing debounce inside the subscription callback (250-500ms window), so an event burst produces one refetch.

```
// inside useEffect, before the channel setup
let timer: ReturnType<typeof setTimeout> | null = null;
const flush = () => {
  timer = null;
  for (const key of queryKeysRef.current) qc.invalidateQueries({ queryKey: key });
};
const onEvent = () => {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 300); // trailing debounce: burst -> one refetch
};
// .on("postgres_changes", {...}, onEvent)
// cleanup: if (timer) clearTimeout(timer); supabase.removeChannel(channel);
```

#### ⚪ L21 · cacheRegistry key families include broad unscoped prefixes, so one mutation invalidates every project's cached queries
- **Severity:** low · **Effort:** M · unverified-low
- **Location:** `src/services/cacheRegistry.ts:71`
- **Issue:** Several entity registrations in src/services/cacheRegistry.ts invalidate project-agnostic prefixes alongside the scoped keys: drawingSet invalidates ["drawing-sets"] and ["drawing_sets"] globally (lines 71-78), delivery invalidates ["deliveries"], ["deliveries-all"], ["procurement"] and 8 more families (lines 80-95), and change_order invalidates ["projects"] (line 132). invalidateEntity fires all families on every mutation.
- **Impact:** In multi-project sessions (portfolio dashboards open in another tab, PMs hopping projects) a single delivery edit refetches deliveries/procurement queries for every project with an active observer, plus the portfolio '-all' reads — each of which is a capped-2000 or listAll fetch. Correctness is preserved (this is deliberate), but refetch cost grows superlinearly with tenant size.
- **Fix:** Incrementally converge duplicate key spellings (drawing-sets vs drawing_sets) onto one scoped key via getQueryKey(), then drop the unscoped prefixes from families() so invalidation stays per-project; keep the portfolio '-all' keys but give those queries a longer staleTime so a refetch is cheap-by-default. This is a follow-the-registry refactor, testable via the existing cacheRegistry.test.js.

#### ⚪ L22 · Advisor: single auth_rls_initplan lint — demo_requests admin-select policy re-evaluates auth.uid() per row
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/migrations/20260623032908_demo_requests.sql:37`
- **Issue:** The live advisor's only initplan WARN: policy "demo_requests admin select" (supabase/migrations/20260623032908_demo_requests.sql:37-44) uses a bare `auth.uid()` inside its EXISTS clause, so Postgres re-evaluates it for every row instead of once as an InitPlan. Every other policy in the database already uses the (select auth.uid()) pattern.
- **Impact:** demo_requests is a small marketing-intake table read only by global admins, so today's cost is negligible — this is hygiene to keep the advisor board clean (enterprise buyers frequently ask for the advisor output) and to prevent the pattern being copied into a hot table.
- **Fix:** Recreate the policy with the select-wrapped form; apply live via MCP and commit the migration.

```
drop policy if exists "demo_requests admin select" on public.demo_requests;
create policy "demo_requests admin select" on public.demo_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid()) and up.role = 'admin'
    )
  );
```

#### ⚪ L23 · Advisor: 171 unused indexes across 93 tables (write amplification), plus 1 unindexed FK in the stripe schema
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:1`
- **Issue:** The live performance advisor reports 171 unused_index INFO lints spanning 93 public tables — worst offenders: email_messages (8 unused indexes), drawing_revision_comparisons (5), projects (5), documents (5), drawing_zones/drawing_zone_dependencies/drawing_zone_proposals (4 each), deliveries (4), backcharges (4). It also flags one unindexed foreign key: stripe._managed_webhooks.fk_managed_webhooks_account (Stripe wrapper-managed schema). UNCONFIRMED: with production traffic still low, many of these may simply be not-yet-exercised rather than genuinely dead — usage stats should be re-checked after sustained real traffic before dropping.
- **Impact:** Each unused index adds write amplification and vacuum overhead on INSERT/UPDATE-heavy paths (email ingest, drawing revisions, deliveries) and storage bloat; at enterprise write volumes this is a real tax. The stripe FK is low risk (tiny vendor table) but will keep appearing in advisor runs.
- **Fix:** After 30+ days of production traffic, re-run get_advisors and pg_stat_user_indexes; drop indexes that remain at zero scans on tables belonging to removed/deprecated features first (drawing_zone_*, drawing_revision_comparisons, mitigation_logs), via a reviewed migration. Add the covering index for the stripe FK only if that integration table sees queries.

```
-- verify before dropping (run in SQL editor):
select schemaname, relname, indexrelname, idx_scan
from pg_stat_user_indexes
where idx_scan = 0 and schemaname = 'public'
order by pg_relation_size(indexrelid) desc limit 40;
-- then, per confirmed-dead index:
drop index concurrently if exists public.<index_name>;
```

### Compliance & privacy

The compliance foundation is further along than the project docs suggest: public Terms of Service, Privacy Policy, and Security overview pages exist, are routed pre-auth, and are linked from the landing footer; Sentry is configured privacy-conservatively (sendDefaultPii off, fully masked replay); a per-tenant, RLS-scoped, fail-closed-audited data export ships; and the activities audit trail was made append-only on 2026-06-30. However, all three legal pages are explicitly marked line-1 as unreviewed DRAFT boilerplate while live in production, signup has no clickwrap acceptance, and there is no DPA or complete subprocessor disclosure — critically, OpenAI/Anthropic receive drawings, emails, and RFIs via llm-proxy but are not disclosed anywhere. The Privacy Policy promises post-closure deletion and retention limits that the system cannot deliver: there is no account/org/user deletion path anywhere (everything is soft-delete), no storage-file deletion, and zero retention/purge automation for email bodies, telemetry, or audit rows. Live Stripe billing collects no sales tax despite Arizona TPT applying from the first dollar. For a US-first steel-fabricator market the gaps are fixable in weeks, but an enterprise security questionnaire today would fail on DPA, deletion, retention, access-review evidence, and change-management controls.

**Strengths:**
- Public legal pages exist and are properly wired: Terms, Privacy, and Security pages (src/pages/Terms.jsx, Privacy.jsx, Security.jsx) are routed above the auth gate (src/App.jsx:25-45) so logged-out visitors can read them, and are linked from the landing footer (src/pages/Landing.jsx:791-798). Content is accurate to the actual architecture (RLS tenant isolation, masked replay, Stripe no-card-storage, AI-output disclaimer in Terms §7-8 tailored to fab-release/pay-app liability).
- Sentry is configured privacy-first: sendDefaultPii:false, replay with maskAllText+blockAllMedia, 10% sampling, and an explicit in-code rule never to attach email/financial/document data (src/instrument.js:32-39). No other analytics/tracking scripts exist — index.html loads only fonts.
- Per-tenant data export is real and well-engineered: project-export edge fn is RLS-scoped (caller cannot export projects they can't read), returns a versioned envelope, and fails closed if the service-role audit row cannot be written (supabase/functions/project-export/index.ts:246-260); src/lib/workspaceExport.ts bundles it into a whole-workspace download and surfaces partial failures instead of hiding them.
- Audit trail is now tamper-evident: migration supabase/migrations/20260630040350_activities_append_only.sql dropped UPDATE/DELETE policies on activities (INSERT+SELECT only), matching fab_release_log/ai_audit_log/backcharge_events — closing the 2026-06-29 audit's 'activities mutable' Medium.
- LLM telemetry stores metadata only — provider/model/tokens/cost/latency, never prompt or document content (supabase/functions/llm-proxy/index.ts:428-436; llm_telemetry schema has no content column). Edge function logs consistently log scope identifiers, not bodies (e.g. project-export/index.ts:262-266, email-ingest logs status/counts only). Spend controls (per-user quota, model allowlist, kill switch) limit AI blast radius.
- Change management has a real technical gate: production deploys only run after CI passes lint + 5 typecheck gates + tests + build (.github/workflows/ci.yml, 228 lines), and Vercel git auto-deploy is off — a red push cannot reach production.
- Encryption at rest and in transit is platform-inherited from Supabase/Vercel and is correctly represented (not overclaimed) on the Security page.
- Access administration UIs exist for reviews: OrgMembers.jsx (invite/revoke/role/remove with seat enforcement) and ProjectMembers.jsx give admins the surfaces needed to conduct periodic access reviews.


#### 🟠 H11 · Right to erasure is unimplementable and contradicts the published Privacy Policy
- **Severity:** high · **Effort:** L · CONFIRMED
- **Location:** `src/pages/Privacy.jsx:166`
- **Issue:** The Privacy Policy promises 'After account closure, we delete or anonymize data within a commercially reasonable period' (src/pages/Privacy.jsx:166-174), but no deletion mechanism exists anywhere: there is no account-closure or workspace-deletion path in the UI or API; all entity deletes are soft-deletes (src/api/supabaseClient.ts:526) and project 'deletion' is the soft_delete_project archive RPC (src/api/supabaseClient.ts:579); nothing ever calls auth.admin.deleteUser or deletes auth.users rows; storage objects (drawings, photos, email attachments) are never deleted; removing an org member (src/pages/OrgMembers.jsx:184-187) leaves their user_profiles row, auth account, comments, and uploaded content intact. A GDPR Art.17/CCPA deletion request, or simply a churned customer demanding data destruction per contract, cannot be honored — and publishing a deletion promise you cannot execute is FTC Act §5 deception exposure.
- **Impact:** Cannot honor deletion requests from data subjects or off-boarding customers; every churned tenant's financials, drawings, and emails persist indefinitely; the live Privacy Policy makes a false claim about current practice.
- **Fix:** Short term: build a documented off-boarding runbook (service-role SQL to hard-delete an org's rows across all project-scoped tables + storage.objects under the org prefix + auth.admin.deleteUser for orphaned users), and soften the policy wording until automated. Medium term: an admin-invoked 'delete workspace' edge function (service role, org-owner-gated, grace period, audited).

```
// supabase/functions/org-delete/index.ts (sketch)
// 1. verify caller JWT + org owner role
// 2. 30-day grace: mark organizations.deletion_requested_at, then a
//    pg_cron job executes:
const admin = createClient(url, serviceKey);
const { data: projects } = await admin.from('projects')
  .select('id').eq('org_id', orgId);
for (const p of projects) {
  await admin.rpc('hard_delete_project', { p_project_id: p.id }); // new RPC: DELETE (not soft) across all child tables
}
// storage: list + remove all objects under app-files/{orgId}/
const { data: objs } = await admin.storage.from('app-files').list(orgId, { limit: 1000 });
await admin.storage.from('app-files').remove(objs.map(o => `${orgId}/${o.name}`));
// auth users whose only org this was:
await admin.auth.admin.deleteUser(userId);
// finally delete organization_members, organization_invitations, organizations row
// and write ONE service-role audit row recording the deletion.
```

#### 🟠 H12 · All three legal pages are live in production while marked unreviewed DRAFT, and signup has no clickwrap acceptance
- **Severity:** high · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `src/pages/Landing.jsx:834`
- **Issue:** Terms.jsx, Privacy.jsx, and Security.jsx each open with '// DRAFT — standard boilerplate. MUST be reviewed by legal counsel before production reliance.' (line 1 of each) yet are publicly served on steelbuild-pro.com. The signup form (src/pages/Landing.jsx:834-855) collects name/email/password and creates the account with no 'I agree to the Terms and Privacy Policy' link, checkbox, or recorded acceptance (no timestamp/version stored anywhere). The Terms rely purely on browsewrap ('By creating an account… you agree', Terms.jsx:56-61), which US courts routinely refuse to enforce — putting the liability cap (§9), indemnification (§10), and the construction-critical output disclaimer (§7-8) at risk of being unenforceable against exactly the pay-app/fab-release liability they were written for.
- **Impact:** The contractual protections shielding the company from construction/financial-decision liability may not bind users; counsel has never validated the operative terms of a live commercial SaaS.
- **Fix:** 1) Have counsel review/finalize all three pages and remove the DRAFT markers (manual). 2) Add clickwrap: a line under the Create-account button linking /terms and /privacy, and record acceptance version+timestamp in user_metadata at signUp so acceptance is provable per user.

```
// Landing.jsx — below the submit button in signup mode:
{authMode === "signup" && (
  <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0", textAlign: "center" }}>
    By creating an account you agree to the{" "}
    <a href="/terms" target="_blank" style={{ color: C.goldB }}>Terms of Service</a> and{" "}
    <a href="/privacy" target="_blank" style={{ color: C.goldB }}>Privacy Policy</a>.
  </p>
)}

// AuthContext.tsx — record provable acceptance at signup:
await supabase.auth.signUp({
  email, password,
  options: { data: {
    full_name: fullName,
    terms_accepted_at: new Date().toISOString(),
    terms_version: "2026-06-22",
  }},
});
```

#### 🟠 H13 · No DPA, and the subprocessor list omits the AI providers that receive customer project data
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `src/pages/Privacy.jsx:111`
- **Issue:** No Data Processing Agreement/Addendum exists anywhere in the repo (TECH_DEBT.md:18 acknowledges 'a basic DPA' is still needed). The Privacy Policy's sub-processor section (src/pages/Privacy.jsx:111-142) lists only Supabase, Vercel, Stripe, and Sentry — but llm-proxy routes customer drawings, revision diffs, sheet extractions, inbound email content (email-classify), RFIs, schedules, and photos to OpenAI (all 13 use-cases) and optionally Anthropic (supabase/functions/llm-proxy/router.ts:31-57, providers/anthropic.ts + openai.ts). Neither AI provider is disclosed, and there is no statement of their retention/training posture (OpenAI API's default no-training + 30-day abuse retention, or ZDR eligibility). The only training-related sentence ('we do not use your customer project data to train third-party advertising models', Privacy.jsx:106-108) does not cover LLM providers. Enterprise buyers and any GDPR-scoped customer will require a signed DPA with a complete, change-notified subprocessor list before contracting.
- **Impact:** Undisclosed transfer of confidential construction financials/drawings/emails to third-party AI providers; unable to pass enterprise procurement or sign customers who require Art.28 processor terms.
- **Fix:** 1) Add OpenAI and Anthropic (and Google Fonts if retained) to the Privacy Policy sub-processor list with purpose ('AI-assisted document analysis; API data not used for model training; retained per provider API terms'). 2) Publish a standalone /subprocessors page with a change-notification commitment. 3) Have counsel produce a standard DPA (SCC-ready if EU subjects ever appear) and link it from /terms; execute/confirm DPAs upstream with OpenAI, Anthropic, Supabase, Vercel, Stripe, Sentry, and evaluate OpenAI Zero-Data-Retention for the drawing/email use-cases.

```
// Privacy.jsx — add to the sub-processors <ul>:
<li>
  <strong style={strong}>OpenAI</strong> — AI-assisted document analysis
  (drawing revision comparison, sheet extraction, email classification,
  RFI drafting). Data sent via API is not used to train OpenAI models and
  is retained only per OpenAI's API data-usage policy.
</li>
<li>
  <strong style={strong}>Anthropic</strong> — alternate AI model provider
  for the same AI-assisted features, under equivalent no-training API terms.
</li>
```

#### 🟠 H14 · Live Stripe billing collects no sales tax — Arizona TPT liability accruing from first dollar
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/stripe-billing/index.ts:194`
- **Issue:** The stripe-billing checkout session (supabase/functions/stripe-billing/index.ts:194-204) has no automatic_tax, tax_id_collection, or customer address collection — grep for 'tax' across the function returns nothing — and billing is live with a production key. Arizona TPT treats SaaS as taxable (rental classification) with no minimum threshold for an in-state seller, so every AZ-customer subscription dollar is accruing untaxed TPT liability plus penalties/interest, and the webhook does not split revenue vs. tax-payable.
- **Impact:** Growing state tax liability with penalties on a live revenue stream; a routine ADOR audit or diligence review would surface it immediately.
- **Fix:** Register for an AZ TPT license (manual), enable Stripe Tax in the dashboard (manual), then enable automatic tax on checkout and record the tax split in the webhook's billing_events handling.

```
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: customerId,
  line_items: [{ price: priceId, quantity: 1 }],
  client_reference_id: org_id,
  metadata: { org_id, plan: plan ?? "" },
  subscription_data: { metadata: { org_id, plan: plan ?? "" } },
  allow_promotion_codes: true,
  // NEW — requires Stripe Tax enabled + prices marked taxable:
  automatic_tax: { enabled: true },
  customer_update: { address: "auto" }, // let Stripe capture billing address for tax situs
  success_url: `${origin}/Billing?status=success`,
  cancel_url: `${origin}/Billing?status=cancel`,
});
```

#### 🟡 M20 · Per-tenant export covers only 15 of ~100 project tables and no files — falls short of the Privacy Policy's export claim
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/functions/project-export/index.ts:40`
- **Issue:** PROJECT_EXPORT_TABLES (supabase/functions/project-export/index.ts:40-56) exports 15 tables; the baseline schema defines ~100 project-scoped tables. Excluded personal/business data includes comments, contacts (names/emails/phones), documents, email_messages + email_attachments (full email bodies), pay_applications, backcharges, tm_tickets, photos, drawing_markups, uploaded_files, safety_incidents, QC records, and the activities audit trail — plus every storage object (drawing PDFs, photos, attachments). The Privacy Policy claims admins 'can export their workspace data at any time' (src/pages/Privacy.jsx:176-185), and contractual data-return obligations on termination could not be met with this envelope.
- **Impact:** GDPR Art.15/20 access/portability responses would be materially incomplete; churned customers cannot actually take their data (especially drawings — the core asset) out.
- **Fix:** Expand PROJECT_EXPORT_TABLES to cover all project-scoped tables (drive it from a shared registry rather than a hand list), add a storage-file manifest with short-lived signed URLs (or a zip pipeline), and state exclusions explicitly in the Privacy Policy until parity is reached. Keep the fail-closed audit behavior.

```
const PROJECT_EXPORT_TABLES: readonly string[] = [
  // existing 15 ...
  "comments", "contacts", "documents", "uploaded_files", "photos",
  "email_messages", "email_attachments",
  "pay_applications", "pay_application_lines",
  "backcharges", "backcharge_tm_tickets", "backcharge_events",
  "drawing_revisions", "drawing_markups", "drawing_signoffs",
  "fab_releases", "fab_release_log", "piece_production",
  "inspections", "quality_control_records", "safety_incidents",
  "change_requests", "budget_hour_items", "scope_items",
  "activities", // audit trail belongs to the tenant too
] as const;
// Plus: a `files` section — list storage objects under the project prefix
// and emit { path, size, signed_url (15-min expiry) } per file.
```

#### 🟡 M21 · No data-retention policy or purge automation — email bodies, telemetry, and audit rows retained forever
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/migrations/20260101000020_baseline_seed.sql:79`
- **Issue:** email_messages/email_attachments store full inbound email bodies and sender name/address (supabase/migrations/20260101000010_baseline_schema.sql:3677-3689), llm_telemetry and activities grow unbounded, and the only pg_cron jobs are reconcile-stuck-extractions and escalate-rfi-sla (supabase/migrations/20260101000020_baseline_seed.sql:79-82) — there is no purge/retention job anywhere. Soft-deleted rows (is_deleted=true) are also never physically removed. The Privacy Policy's Data Retention section (src/pages/Privacy.jsx:166-174) implies bounded retention that has no operational backing, and SOC 2 auditors expect a documented, enforced retention schedule.
- **Impact:** Unbounded accumulation of third-party PII (email senders are people who never agreed to any policy), larger breach blast radius, and a retention answer on any security questionnaire that is 'indefinite'.
- **Fix:** Adopt a written retention schedule (e.g. llm_telemetry 13 months, soft-deleted rows 90 days after deleted_at, email of closed projects per-org configurable) and enforce it with pg_cron purge jobs committed as migrations.

```
-- migration: retention purge jobs (pg_cron)
create or replace function public.purge_expired_rows()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.llm_telemetry where occurred_at < now() - interval '13 months';
  -- hard-delete rows soft-deleted more than 90 days ago:
  delete from public.email_messages where is_deleted and deleted_at < now() - interval '90 days';
  delete from public.rfis          where is_deleted and deleted_at < now() - interval '90 days';
  -- ...repeat per SOFT_DELETE_TABLES member
end $$;
revoke all on function public.purge_expired_rows() from public, anon, authenticated;
select cron.schedule('retention-purge', '30 9 * * *', 'SELECT public.purge_expired_rows();');
```

#### 🟡 M22 · No enterprise policy/assurance corpus: DPA, security questionnaire answers, SOC 2 roadmap, incident-response and breach-notification plan all absent
- **Severity:** medium · **Effort:** L · **Manual step** · CONFIRMED
- **Location:** `docs/TODO.md:1`
- **Issue:** Beyond the three draft web pages, the repo contains no information-security policy, incident-response/breach-notification plan, business-continuity/DR statement (backups are Supabase-inherited but undocumented), vendor-management/subprocessor-review record, security questionnaire answers (CAIQ/SIG-Lite), or SOC 2 roadmap — docs/ has engineering handoffs and audits only. The Privacy Policy also lacks GDPR/CCPA-specific content (no legal bases, no international-transfer statement, no CCPA category disclosures). For US-first steel fabricators this may not block early deals, but the first GC/enterprise customer security review will request most of these documents.
- **Impact:** Enterprise procurement stalls with nothing to send back; a breach today would have no pre-agreed notification commitment or internal runbook.
- **Fix:** Assemble a minimum assurance pack: 1-page infosec policy, incident-response plan with customer-notification SLA (e.g. 72h), backup/DR statement (document Supabase PITR settings), vendor list with DPA status, and a pre-filled CAIQ-Lite. Publish a /trust or extend /security with it. If enterprise deals materialize, start a SOC 2 Type I via an automation vendor (Vanta/Drata/Secureframe) — the CI gates, RLS boundary, and append-only audit logs already satisfy several controls.

#### 🟡 M23 · Direct pushes to main with no enforced peer review (SOC 2 change-management gap)
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:1`
- **Issue:** Production deploys from main are CI-gated (real strength), but the repo is on a plan without branch protection, and the documented workflow has ~10 concurrent agents committing straight to main (CLAUDE.md §7-8, memory notes). There is no required PR review, no approval trail, and no separation between author and approver — SOC 2 CC8.1 expects changes to production systems to be authorized and reviewed. UNCONFIRMED: GitHub plan/branch-protection state can only be inferred from repo docs ('Branch protection is unavailable — private repo on a free GitHub plan'), not verified from the worktree.
- **Impact:** A single compromised credential or bad automated commit reaches production with no human review; no change-approval evidence for auditors.
- **Fix:** Move the repo to a GitHub org (free orgs get branch protection on private repos) or upgrade the plan; then require PRs with 1 approval into main, keep the existing CI checks as required status checks, and retire the direct-push deploy flow.

#### ⚪ L24 · Access grants, revocations, and role changes are not audit-logged (SOC 2 CC6.2/CC6.3 evidence gap)
- **Severity:** low · **Effort:** M · PLAUSIBLE
- **Location:** `src/pages/OrgMembers.jsx:184`
- **Issue:** Org member invite/accept/role-change/removal (src/pages/OrgMembers.jsx:179-187 via src/lib/org helpers) and project member/role mutations (src/pages/ProjectMembers.jsx) write nothing to the activities audit trail — grep for auditLogger/activities in those files returns no matches, and CLAUDE.md §2.5 itself lists 'project member/role changes' as remaining audit coverage. SOC 2 access-management controls require evidence of who granted/revoked access and when; today a quarterly access review can see current state but not change history.
- **Impact:** Cannot produce provisioning/deprovisioning evidence for an audit or investigate 'who gave this user pm access' after an incident.
- **Fix:** Prefer a DB-level trigger (survives every client path) on user_projects and organization_members that inserts an append-only activities row on INSERT/UPDATE(role)/DELETE; minimally, add auditLogger calls to the member mutation handlers.

```
create or replace function public.log_membership_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activities (project_id, entity_type, entity_id, action, description, performed_by, timestamp)
  values (
    coalesce(new.project_id, old.project_id),
    'ProjectMember',
    coalesce(new.user_id, old.user_id)::text,
    lower(tg_op),
    format('membership %s: role %s -> %s', lower(tg_op), old.role, new.role),
    coalesce(auth.uid()::text, 'system'),
    now());
  return coalesce(new, old);
end $$;
create trigger trg_user_projects_audit
  after insert or update of role or delete on public.user_projects
  for each row execute function public.log_membership_change();
-- repeat for organization_members (project_id null → use a nullable org_id column or entity metadata)
```

#### ⚪ L25 · Google Fonts loaded from Google's CDN discloses visitor IPs to Google pre-consent
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `index.html:49`
- **Issue:** index.html:49-51 loads six font families from fonts.googleapis.com/fonts.gstatic.com on every page including the public landing and legal pages. German case law (LG München, 2022) held that transmitting a visitor's IP to Google via remote Google Fonts without consent violates GDPR; the Privacy Policy's cookie section also doesn't mention Google. US-first risk is minimal, but the fix is trivial and also improves performance and removes Google as an undisclosed data recipient.
- **Impact:** Minor GDPR exposure for any EU visitor; an inconsistency between actual third-party data flows and the published policy.
- **Fix:** Self-host the fonts (fontsource packages) and drop the Google links.

```
// npm i @fontsource/inter @fontsource/barlow-condensed @fontsource/ibm-plex-mono ...
// src/main.jsx:
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-mono/500.css";
// then delete the three <link> tags in index.html:49-51
```

#### ⚪ L26 · Sentry session replay/tracing runs unconditionally — no consent mechanism for EU visitors
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/instrument.js:37`
- **Issue:** src/instrument.js:37-57 starts browser tracing and samples 10% of all sessions (100% of error sessions) for replay from first paint, on public pages included, with no consent gate. Replays are fully masked (good), but under GDPR/ePrivacy session replay and performance tracing are generally not 'strictly necessary' and would need consent for EU users; the Privacy Policy's cookie section claims essential-only usage. There is no cookie/consent banner anywhere in src (no matches for consent/CookieConsent). For a US-only customer base this is acceptable; it becomes a gap the moment an EU data subject uses the app.
- **Impact:** ePrivacy/GDPR consent exposure limited to EU visitors; minor policy-vs-practice inconsistency (replay is monitoring, not strictly essential).
- **Fix:** Either document Sentry masked replay explicitly as legitimate-interest security monitoring in the Privacy Policy (counsel call), or lazy-add the replay integration only after a lightweight consent/notice for visitors in EU locales (Sentry supports addIntegration post-init).

```
// consent-gated replay (post-init):
import * as Sentry from "@sentry/react";
export function enableReplayAfterConsent() {
  const client = Sentry.getClient();
  if (!client) return;
  client.addIntegration(
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })
  );
}
// init keeps browserTracingIntegration only; call enableReplayAfterConsent()
// immediately for US visitors, or after banner accept for EU locales.
```

#### ⚪ L27 · Published compliance contact mailboxes and DSR handling process are unverified
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `src/pages/Privacy.jsx:32`
- **Issue:** UNCONFIRMED: the legal pages commit to privacy@steelbuild-pro.com, support@steelbuild-pro.com, and security@steelbuild-pro.com (src/pages/Privacy.jsx:32-36, Terms.jsx:32-35, Security.jsx:32-35) as the channel for rights requests and security reports, but whether these mailboxes exist and are monitored cannot be verified from the repo, and there is no documented data-subject-request intake/verification/response process or log. An unanswered rights request or vulnerability report is itself a compliance failure.
- **Impact:** Rights requests or vulnerability disclosures could silently bounce; no evidence trail of DSR handling for audits.
- **Fix:** Provision the three mailboxes (or aliases to a monitored inbox) on the steelbuild-pro.com domain, and keep a simple DSR log (date received, identity verified, action, date completed) — a spreadsheet is sufficient at this stage. Add a 30-day response SLA to the Privacy Policy.

### Accessibility

SteelBuild Pro has never had a formal WCAG pass, and it shows in four systemic gaps — yet the shell fundamentals are unexpectedly solid (skip-nav link, main/nav landmarks, focus-to-main on route change, aria-current nav, a shared focus-trap hook, a high-contrast toggle, Radix primitives on key upload modals). The blocking problems are: (1) essentially zero programmatic label association on forms (~502 sibling <label> elements vs 4 htmlFor in the whole app), (2) mouse-only activation of core-workflow rows and tables (the Submittals register rows, the new command-kit DataTable used by ~30 Control Centers, sortable headers), (3) keyboard focus made invisible on every button in the default dark theme by a global outline:none with only a light-theme replacement, and (4) contrast failures baked into the new command_ui light kit (status chips at 1.7-2.7:1, colored KPI values below 3:1). Today the app would score 'Partially Supports' at best on WCAG 1.3.1, 1.4.3, 2.1.1, 2.4.7, and 4.1.2 in a VPAT/ACR, and no VPAT, accessibility statement, or a11y tooling (jsx-a11y lint, axe tests) exists. The good news: the fixes are mostly mechanical, the team demonstrably knows the correct patterns (KpiTile and triage rows implement role=button+tabIndex+Enter/Space perfectly), and the worst offenders are concentrated in a handful of shared components, so remediation leverage is high.

**Strengths:**
- Skip-to-main-content link is the first focusable element, <main id="main-content" tabIndex={-1}> with focus moved to main on every route change (src/Layout.jsx:159,271; src/components/nav/SkipToMainContentLink.jsx; src/components/nav/useFocusMainOnRouteChange.js), and it is covered by a test (src/__tests__/components/Layout.test.jsx:105)
- Landmark and nav semantics are real: <nav aria-label="Primary">, aria-current="page" on active nav items in both SidebarNav and MobileDrawer, aria-labels throughout the sidebar (src/components/nav/SidebarNav.jsx:361,579,792,901,990,1065)
- A user-facing high-contrast mode exists ([data-contrast="high"] token overrides in src/styles/tokens.css:67-78 plus src/components/nav/HighContrastToggleButton.jsx), and the light theme's muted-text tokens were deliberately darkened for contrast (tokens.css:397-398)
- Radix/shadcn primitives (Dialog, Select, Checkbox, etc.) are present and genuinely used in ~41 files including both core drawing-intake modals — DrawingSetUploadModal.jsx:1296 and RevisionUploadModal.jsx:842 get focus trap, Escape, and dialog labelling for free; Submittals filters use Radix Select
- A shared useFocusTrap hook (src/hooks/useFocusTrap.js) correctly traps Tab, honors [data-autofocus], and restores focus on close; the design-system Modal (src/components/design-system/Modal.jsx) combines it with Escape-to-close, role="dialog", aria-modal, and body-scroll lock
- Status is never color-only in the sampled core screens: StatusPill renders the status text with role="status" and aria-label (src/components/design-system/StatusPill.jsx:26-27), command-kit Pills carry text children, and Submittal rows pair the color rail with a text chip
- The accessible-interactive pattern is already institutionalized in places: KpiTile (design-system/KpiTile.jsx:93-97) and the hub TriageItemRow (src/pages/drawingSubmittalHub/triageBoard.tsx:1018-1027) implement role=button + tabIndex + Enter/Space, hub tabs use role="tab"/aria-selected (DetailingCommandShell.tsx:196-200), and the Gantt drawer's parent picker is a keyboard-navigable combobox (src/components/schedule/TaskDetailDrawer.jsx:88,156)
- Sonner Toaster (with built-in aria-live announcements) is mounted app-wide in Layout.jsx:417; the PDF viewer iframe has a title (src/pages/DrawingViewer.jsx:800); 14 of 17 <img> tags carry alt text; index.html declares lang="en"


#### 🟠 H15 · Form inputs are almost never programmatically labeled (4 htmlFor in the entire app vs ~502 visual labels)
- **Severity:** high · **Effort:** M · CONFIRMED
- **Location:** `src/components/expenses/ExpenseFormModal.jsx:184`
- **Issue:** The app-wide form pattern is a sibling <label style={labelStyle}>Field</label> followed by a separate <input>/<select> with no htmlFor/id association and no aria-label — e.g. src/components/expenses/ExpenseFormModal.jsx:184-224, and the same pattern across ~92 files (RFIFormModal, SheetFormModal, DeliveryFormModal, DrawingSetUploadModal fields, etc.). A repo-wide grep finds only 4 htmlFor occurrences (ui/form.jsx, dms/UploadModal.jsx, dms/DocumentEditModal.jsx, productionnotes/ProductionNoteFormModal.jsx). Search inputs use placeholder-as-label (src/pages/Submittals.tsx:602-607). Inline validation errors are adjacent <p> tags with no aria-describedby or role=alert (ExpenseFormModal.jsx:186).
- **Impact:** Screen-reader users hear 'edit text, blank' for virtually every field in every create/edit modal, including the core RFI, submittal, drawing, expense, and delivery forms — WCAG 1.3.1, 3.3.2, and 4.1.2 failures across the whole product. This is the single largest item a VPAT auditor or enterprise a11y scan (axe flags every instance) will hit.
- **Fix:** Fix the shared pattern once, then sweep: create a small FormField wrapper (or extend the existing label pattern) that generates a useId()-based id, sets htmlFor on the label and id + aria-describedby (for errors) on the control. Migrate the ~15 highest-traffic core-workflow modals first (RFI, Submittal, Drawing upload, Expense, Delivery), then the rest mechanically. Add aria-label to placeholder-only search inputs immediately (1-line each).

```
// src/components/shared/FormField.jsx
import { useId } from "react";
export function FormField({ label, error, required, children, labelStyle }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div>
      <label htmlFor={id} style={labelStyle}>{label}{required ? " *" : ""}</label>
      {children({ id, "aria-invalid": !!error || undefined, "aria-describedby": error ? errId : undefined })}
      {error && <p id={errId} role="alert" style={{ fontSize: 10, color: "var(--status-error)" }}>{error}</p>}
    </div>
  );
}
// usage:
// <FormField label="Description" required error={errors.description}>
//   {(a11y) => <input {...a11y} value={form.description} onChange={...} style={iStyle} />}
// </FormField>

// Quick win for search boxes (Submittals.tsx:602):
// <input className="sbd-input" aria-label="Search submittals by number, title, or spec section" placeholder="Search # / title / spec section" ... />
```

#### 🟠 H16 · Core-workflow rows and tables are mouse-only: clickable divs/<tr>s without role, tabIndex, or key handlers (~181 instances across 92 files)
- **Severity:** high · **Effort:** M · CONFIRMED
- **Location:** `src/components/command/DataTable.tsx:32`
- **Issue:** The primary activation path on core screens is an onClick on a non-interactive element with no keyboard equivalent: (a) SubmittalRow — the row of the main Submittals register — is a bare clickable div (src/pages/submittals/components.tsx:142-163); (b) the new command-kit DataTable renders <tr onClick> with class is-clickable but no tabIndex/role/onKeyDown (src/components/command/DataTable.tsx:32), and this component backs ~30 Control Centers; (c) the Detailing hub register's Health sort control is a plain <span onClick> (src/pages/drawingSubmittalHub/drawingRegisterTable.tsx:157-163) with no button semantics or aria-sort, inside a div-built grid with no table/grid roles; (d) a multiline grep finds 181 onClick-on-div/span/tr instances across 92 files (worst: PortfolioView.jsx with 19). Counter-examples proving the fix pattern exists in-repo: KpiTile.jsx:93-97 and triageBoard.tsx:1018-1027.
- **Impact:** A keyboard-only or switch user cannot open a submittal from the register, cannot open any row in the new Control Centers, and cannot sort the drawing register — WCAG 2.1.1 (Keyboard) and 4.1.2 failures on the moat workflow itself. Because DataTable is the shared go-forward table, every new Control Center inherits the defect.
- **Fix:** Fix the two shared components first (DataTable row: role=button semantics via tabIndex+Enter/Space, or better, put the activation on a real <button>/<a> in the first cell; SubmittalRow: same pattern already used in TriageItemRow), convert the sort span to a <button> with aria-sort on its column, then burn down the remaining clickable-div list starting with drawings/submittals/RFI screens. Add eslint-plugin-jsx-a11y (see tooling finding) to stop regressions.

```
// src/components/command/DataTable.tsx (row render)
<tr
  key={row.id || i}
  className={onRowClick ? "is-clickable" : undefined}
  onClick={onRowClick ? () => onRowClick(row) : undefined}
  tabIndex={onRowClick ? 0 : undefined}
  role={onRowClick ? "button" : undefined}
  onKeyDown={onRowClick ? (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); }
  } : undefined}
>

// drawingRegisterTable.tsx:157 — sortable header
<button
  onClick={cycleSort}
  aria-sort={sortByHealth === "asc" ? "ascending" : sortByHealth === "desc" ? "descending" : "none"}
  style={{ all: "unset", cursor: "pointer" }}
>Health{arrow}</button>
```

#### 🟠 H17 · command_ui light kit ships contrast failures: status chips at 1.7-2.7:1 and colored KPI values below 3:1
- **Severity:** high · **Effort:** S · CONFIRMED
- **Location:** `src/styles/command.css:46`
- **Issue:** In src/styles/command.css (the light Control Center kit rolled out to ~30 modules): .cmd-chip--warn is #f59e0b on #fbe5c0 ≈ 1.75:1 (line 47); .cmd-chip--good is #12b76a on #d6f0de ≈ 2.2:1 (line 46); .cmd-chip--danger is #ef4444 on #f9d2ce ≈ 2.7:1 (line 48) — all 12px text needing 4.5:1. The colored KPI values (.cmd-kpi--warn/.cmd-kpi--good .cmd-kpi__value, lines 62-65) render #f59e0b / #12b76a on white at ≈2.15:1 and ≈2.6:1 — 26px bold counts as large text but still needs 3:1. --cmd-text-muted #6b7585 (line 11) is ≈4.3:1 on the #f4f6f9 page background at 11-12px, marginally under 4.5:1. (The solid .cmd-pill variants at lines 86-91 and the gold primary button at line 101 pass — the tinted chips and colored values are the problem.)
- **Impact:** WCAG 1.4.3 (Contrast Minimum) fails on exactly the elements that carry workflow meaning — status chips and exception KPI counts — in the product's go-forward visual direction. Low-vision users and anyone on a jobsite tablet in sunlight lose the warn/good/danger signal; automated scans (axe, Lighthouse) will flag every Control Center.
- **Fix:** Darken the on-tint text colors: use dedicated darker text tokens for chip text (amber-800/green-800/red-700 style) while keeping the pastel backgrounds, darken the KPI value colors ~25%, and bump --cmd-text-muted to #5b6474 or darker. This is a token-only change — no component edits.

```
/* src/styles/command.css — AA-passing replacements */
[data-skin="command"] {
  --cmd-text-muted: #57606f;      /* was #6b7585 — 5.4:1 on #f4f6f9 */
  --cmd-good-text: #067647;       /* on #d6f0de: 5.6:1 */
  --cmd-warn-text: #93540b;       /* on #fbe5c0: 4.9:1 */
  --cmd-danger-text: #b42318;     /* on #f9d2ce: 4.8:1 */
}
[data-skin="command"] .cmd-chip--good { background: #d6f0de; color: var(--cmd-good-text); }
[data-skin="command"] .cmd-chip--warn { background: #fbe5c0; color: var(--cmd-warn-text); }
[data-skin="command"] .cmd-chip--danger { background: #f9d2ce; color: var(--cmd-danger-text); }
[data-skin="command"] .cmd-kpi--good .cmd-kpi__value { color: #079455; }  /* 3.4:1 on #fff, large text */
[data-skin="command"] .cmd-kpi--warn .cmd-kpi__value { color: #b54708; }  /* 4.9:1 */
```

#### 🟡 M24 · Keyboard focus is invisible on every <button> in the default dark theme (global outline:none with light-theme-only replacement)
- **Severity:** medium · **Effort:** S · PLAUSIBLE
- **Location:** `src/styles/base.css:28`
- **Issue:** src/styles/base.css:28 sets `button { cursor: pointer; outline: none; }` globally, and the compensating focus ring at base.css:185-191 is scoped to [data-theme="light"] only (`[data-theme="light"] button:focus-visible { outline: 2px solid var(--accent) }`). SteelBuild Dark is the primary theme, so in the shipped default a keyboard user tabbing through any screen gets no visible focus indicator on buttons, [role=button] elements, or links. Compounding this, ~100+ components set inline outline:'none' on custom controls, and the command-kit search input kills its outline too (src/styles/command.css:96).
- **Impact:** WCAG 2.4.7 (Focus Visible) fails across the entire dark-theme app — sighted keyboard users literally cannot tell where they are. This is one of the first checks in any enterprise accessibility audit and it fails on every page.
- **Fix:** Remove the [data-theme="light"] scoping so the :focus-visible ring applies in both themes (the accent gold ring works on dark surfaces), and delete the bare `outline: none` from the button reset — :focus-visible already suppresses the ring for mouse clicks in all supported browsers. Then sweep inline outline:'none' occurrences that lack a replacement indicator.

```
/* src/styles/base.css */
- button { cursor: pointer; outline: none; }
+ button { cursor: pointer; }

- [data-theme="light"] button:focus-visible,
- [data-theme="light"] a:focus-visible,
- [data-theme="light"] [role="button"]:focus-visible,
- [data-theme="light"] [tabindex]:focus-visible {
+ button:focus-visible,
+ a:focus-visible,
+ [role="button"]:focus-visible,
+ [tabindex]:focus-visible {
    outline: 2px solid var(--accent) !important;
    outline-offset: 2px !important;
  }

/* command.css:96 — replace the killed outline */
[data-skin="command"] .cmd-search:focus-within { box-shadow: 0 0 0 2px var(--cmd-gold); }
```

#### 🟡 M25 · ~50 bespoke fixed-overlay modals/drawers lack dialog semantics, focus trapping, or Escape handling (inconsistent modal stack)
- **Severity:** medium · **Effort:** L · CONFIRMED
- **Location:** `src/components/rfis/RFIFormModal.jsx:414`
- **Issue:** 74 files render bespoke position:fixed full-screen overlays, but only 26 files carry aria-modal/role=dialog. Quality varies wildly: design-system/Modal.jsx and leadTimesModal.tsx are correct (trap + Escape + role); RFIFormModal.jsx has useFocusTrap (line 102) but no role="dialog"/aria-modal and no Escape on the modal itself (only on an inner dropdown, line 778); many others (WorkPackageDetailModal, ExpenseImportModal, PhotoGallery lightbox, commandcenter ItemDetailDrawer/ForwardLookDrawer, schedule Bulk* modals) are plain divs with none of it. Escape support and focus restore are therefore unpredictable per screen.
- **Impact:** Screen readers don't announce these as dialogs and background content stays in the reading order (WCAG 1.3.1, 4.1.2); keyboard users can Tab out of open modals into the page behind (2.4.3, effectively a 2.1.2-style trap in reverse); Escape behavior is inconsistent. Affects edit/detail flows on most non-drawings modules and several drawings-adjacent panels.
- **Fix:** Standardize on the two good primitives that already exist: Radix Dialog (ui/dialog.jsx) or design-system Modal (which composes useFocusTrap + Escape + role=dialog). Migrate bespoke overlays to one of them, starting with core-workflow modals (RFIFormModal needs only role="dialog" aria-modal="true" aria-labelledby + an Escape listener since it already traps). Add aria-labelledby pointing at the modal title in design-system/Modal.jsx while touching it.

```
// Minimal upgrade for a bespoke overlay (pattern from design-system/Modal.jsx):
const trapRef = useFocusTrap(open);
useEffect(() => {
  if (!open) return;
  const onKey = (e) => { if (e.key === "Escape") onClose(); };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [open, onClose]);
...
<div style={overlayStyle} onClick={backdropClose}>
  <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="rfi-modal-title" onClick={(e) => e.stopPropagation()}>
    <h2 id="rfi-modal-title">{title}</h2>
    ...
```

#### 🟡 M26 · Gantt bar move/resize and drag-to-reparent are pointer-only, and the drag handles misuse role="button" without focusability
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `src/components/schedule/ScheduleGantt.jsx:1808`
- **Issue:** In src/components/schedule/ScheduleGantt.jsx:1808-1869, the task-bar move zone and both edge-resize handles are divs with role="button" and aria-label but no tabIndex and no key handlers — activation is exclusively onPointerDown drag. Drag-to-reparent (useTaskRowDnD.js) is likewise HTML5-drag only. MITIGATING: every date/duration/parent change has a keyboard-reachable alternative via the TaskDetailDrawer — date inputs plus a keyboard-navigable parent-picker combobox (src/components/schedule/TaskDetailDrawer.jsx:88,156) — so WCAG 2.1.1 has a conforming alternate path. The residual defects are (a) role="button" on elements that can never receive focus (announced to AT as buttons that don't exist in tab order — 4.1.2 misuse) and (b) no documented/discoverable keyboard alternative from the bar itself.
- **Impact:** Screen-reader users encounter phantom 'Drag/Resize' buttons they cannot reach or operate; keyboard users get no hint that the drawer is the alternative. An auditor will log this even though the alternate path technically saves 2.1.1 conformance.
- **Fix:** Either make the handles genuinely operable (tabIndex=0 + arrow-key nudge of start/finish dates, Enter to open the drawer) or remove role="button" and add aria-hidden="true" to the drag-only affordances, keeping row-level activation (which opens the drawer) as the accessible path. Document the drawer as the keyboard path in the VPAT.

```
// Option A (cheapest, honest semantics): drag affordances are redundant for AT
<div
  title="Drag to move this task's start and finish dates"
  aria-hidden="true"            // remove role="button" + aria-label
  onPointerDown={(e) => startTaskBarDrag(e, task, taskEffS, taskEffE)}
  ...
/>
// Option B (better): keyboard nudging
<div role="button" tabIndex={0}
  aria-label={`Move ${sanitizeTaskName(task)}; arrow keys shift dates by one day`}
  onKeyDown={(e) => {
    if (e.key === "ArrowLeft") nudgeTask(task, -1);
    if (e.key === "ArrowRight") nudgeTask(task, +1);
    if (e.key === "Enter") openDrawer(task);
  }} ... />
```

#### 🟡 M27 · Unnamed close/icon controls: 16 bare '×' close buttons, a non-focusable div close control in the design-system Modal, and decorative SVGs not hidden from AT
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `src/components/design-system/Modal.jsx:123`
- **Issue:** (a) 16 files close modals with <button>×</button> and no aria-label (e.g. src/pages/submittals/components.tsx:359, components/workpackages/WorkPackageDetailModal.jsx, components/schedule/TaskDetailDrawer.jsx, ScheduleGantt.jsx) — announced as 'multiplication sign' or nothing. (b) The design-system Modal's close control is a clickable <div title="Close"> with no role, tabIndex, or key handler (src/components/design-system/Modal.jsx:123-141) — the shared modal's own close button is unreachable by keyboard (Escape works, which partially mitigates). (c) The shared Icon/PhaseIcon SVGs (src/components/design-system/Icon.jsx:58,82) set no aria-hidden, so decorative glyphs can surface as unlabeled graphics.
- **Impact:** WCAG 4.1.2 / 2.1.1 on dismissal controls across core detail panels; screen-reader noise from decorative icons. Low individual severity but very visible in an audit because it repeats on nearly every panel.
- **Fix:** Sweep the 16 '×' buttons to add aria-label="Close"; convert the design-system Modal close div to a real <button aria-label="Close"> (one shared fix); add aria-hidden="true" focusable="false" to the Icon wrapper SVG (one-line, benefits every consumer).

```
// design-system/Modal.jsx:123 — replace the div
<button
  onClick={onClose}
  aria-label="Close"
  style={{ width: 28, height: 28, borderRadius: 6, background: "var(--bg-surface-low)",
    border: "1px solid var(--border-default)", display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", flexShrink: 0 }}
>
  <Icon name="x" size={12} />
</button>

// design-system/Icon.jsx — hide decorative glyphs
<svg aria-hidden="true" focusable="false" ...>

// each bare close button:
<button aria-label="Close" onClick={onClose} ...>×</button>
```

#### 🟡 M28 · No accessibility tooling, tests, or conformance documentation (no jsx-a11y lint, no axe tests, no VPAT/ACR, no accessibility statement)
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `package.json:108`
- **Issue:** package.json devDependencies include eslint-plugin-react/react-hooks/react-refresh/unused-imports (package.json:108-111) but not eslint-plugin-jsx-a11y; no vitest-axe/jest-axe or Playwright axe scans exist; the repo (and the marketing/legal pages, src/pages/Terms.jsx / Privacy.jsx) contain no accessibility statement, and no VPAT/ACR has ever been produced. The only a11y-focused test found is the skip-link assertion in Layout.test.jsx:105.
- **Impact:** Enterprise and public-sector buyers ask for a VPAT/ACR and often an accessibility statement URL during procurement — today there is nothing to hand them, and without lint/CI gates the fixes from this audit will regress (every new clickable div or label reintroduces the defect).
- **Fix:** Add eslint-plugin-jsx-a11y (start with 'recommended' as warnings, promote the rules matching this audit's findings — click-events-have-key-events, label-has-associated-control, no-noninteractive-element-interactions — to errors in CI); add vitest-axe smoke tests for the top 5 core screens; after remediation, produce a WCAG 2.1 AA VPAT using the ITI template and publish an accessibility statement page. The VPAT authoring and statement publication are human/vendor tasks.

```
// package.json (dev)
"eslint-plugin-jsx-a11y": "^6.10.2",
"vitest-axe": "^0.1.0"

// eslint.config.js
import jsxA11y from "eslint-plugin-jsx-a11y";
export default [
  // ...existing,
  { plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/label-has-associated-control": "error",
    } },
];

// example axe smoke test
import { axe } from "vitest-axe";
it("Submittals list has no critical a11y violations", async () => {
  const { container } = renderWithProviders(<Submittals />);
  expect(await axe(container)).toHaveNoViolations();
});
```

#### ⚪ L28 · Animations ignore prefers-reduced-motion almost everywhere
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/styles/animations.css:1`
- **Issue:** Only 2 files in the app honor prefers-reduced-motion (src/pages/rfis/RFIs.css and src/pages/Landing.jsx), while src/styles/animations.css defines app-wide keyframe animations, modals animate in (sbp-modal-rise), and transitions/glows run throughout with no global reduce guard.
- **Impact:** Users with vestibular disorders who set the OS reduced-motion preference still get the full animation set. WCAG 2.3.3 is AAA (not required for AA), so this is hardening — but it is a one-rule fix and commonly checked in enterprise a11y reviews.
- **Fix:** Add a single global media-query kill switch to base.css or animations.css.

```
/* src/styles/base.css */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

#### ⚪ L29 · Pervasive 8-9px fixed-pixel type on workflow-meaningful chips and labels strains 1.4.4 resize and low-vision readability
- **Severity:** low · **Effort:** M · **Manual step** · unverified-low
- **Location:** `src/components/design-system/StatusPill.jsx:20`
- **Issue:** The design system standardizes 8-9px uppercase letter-spaced mono text for status chips and labels (StatusPill sizing fs 8/9 at src/components/design-system/StatusPill.jsx:20; 8px table headers in DrawingSetUploadModal.jsx:568-572; 9px kind labels in triageBoard.tsx:1057), all in inline px so browser font-size preferences (as opposed to full-page zoom) have no effect. UNCONFIRMED: full-page zoom to 200% appears to work since layouts are flex/grid based, which would technically satisfy WCAG 1.4.4 — this needs a browser pass to confirm no clipping/overlap at 200% and 400% (1.4.10 reflow).
- **Impact:** Low-vision users on jobsite tablets get 8px status text as the primary workflow signal; if any container clips at 200% zoom, 1.4.4/1.4.10 fail. Even where technically conformant, it is the kind of finding buyers' a11y testers flag as a usability barrier.
- **Fix:** Verify 200%/400% zoom on the hub, Submittals, and Schedule in a browser (manual). Consider raising the chip floor to 10-11px or expressing chip/label sizes in rem so user font-size settings scale them; the StatusPill size map is the single leverage point for chips.

```
// StatusPill.jsx — rem-based floor
const sizing = size === "xs"
  ? { fs: "0.625rem", py: 2, px: 6 }   // 10px @ default
  : { fs: "0.6875rem", py: 3, px: 8 }; // 11px @ default
...
fontSize: sizing.fs,
```

### Testing & quality gates

Unit/integration testing is a genuine strength: 220 live test files map tightly onto the crown jewels (cents money math, fab-release gate, submittal stage mapping, reparent cycle guard, uploadValidation, permissions matrix, 8+ importers, all 10 service engines), CI runs the full Vitest suite plus lint, four typecheck gates (including two shrink-only strictness ratchets) and a production build on every push/PR, and production deploys are hard-gated on that pipeline. The main enterprise gaps are on the boundaries the unit suite cannot reach: zero code-coverage measurement, near-zero tests and no typecheck gate for the six Deno edge functions (llm-proxy cost/quota logic, email-send, project-export), no automated RLS/tenant-isolation regression suite for the authoritative authorization layer, and a well-designed Playwright E2E harness that is opt-in, post-deploy, non-blocking, and pointed at production — so no browser-level check gates a deploy, and it is unconfirmed whether it runs at all. Test quality is good (behavior-focused, no snapshot tests), with moderate flake risk from wall-clock-relative date fixtures (only 4 files freeze the clock) and permissive any-chain Supabase mocks. The practical next steps are coverage instrumentation, extracting/testing edge-function pure logic, a seeded staging org to unlock a blocking pre-promote E2E of the killer workflow, and a pgTAP-style RLS regression suite.

**Strengths:**
- CI is a true quality gate: eslint + 4 typecheck jobs + full Vitest suite + production build run on every push/PR, and the Vercel production deploy job is gated on all of it (`.github/workflows/ci.yml:42-128`); a red push cannot reach production.
- Crown-jewel logic is genuinely tested, not just smoke-tested: cents-exact money math (src/lib/__tests__/money.test.ts — float-drift, half-up rounding, retainage pctOf), G702/G703 (src/lib/payapp/__tests__/g702.test.ts), fab-release gate incl. fail-safe-on-unknown-RFI-status and soft-delete handling (src/lib/__tests__/fabReleaseGate.test.js), submittal stage mapping, reparentTasks cycle guard (src/lib/schedule/__tests__/), uploadValidation fail-closed backstop, and the canPerform RBAC matrix (src/services/__tests__/permissions.test.js).
- Two CI-enforced type-strictness ratchets (typecheck:strict, typecheck:noimplicitany) with shrink-only ignore lists and a "now clean, remove me" nudge — an unusually disciplined incremental gate design (scripts/strict-typecheck.mjs, scripts/noimplicitany-typecheck.mjs).
- The stripe-billing webhook extracted its org-mapping into pure webhookLogic.ts with a colocated Vitest replay test that runs in the main CI suite (supabase/functions/stripe-billing/__tests__/webhookReplay.test.ts) — a replicable pattern for testing Deno edge functions without a Deno test harness.
- The Playwright harness design is sound: API-seeded auth avoids login-UI coupling (e2e/global-setup.ts), read-only smoke is separated from the mutation-aware fab-gate spec which proves the real client→RLS→BEFORE-INSERT-trigger boundary (e2e/fab-release-gate.spec.ts), fixtures self-skip, and reports upload as CI artifacts.
- No snapshot tests anywhere; tests assert domain behavior (stage transitions, rounding, gate blocking, importer parsing) rather than implementation details, and 27 jsdom component smokes catch first-render crashes on key pages with real router/query providers.
- Test distribution follows the risk profile: 48 files in src/lib (domain mapping/importers/revision intelligence), 16 in src/services (engines), ~35 per-page derive-logic suites from the decomposition campaign, importers each have parser tests, and both drawing-upload modals are covered.


#### 🟠 H18 · No automated regression tests for RLS / tenant isolation — the authoritative authorization boundary
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `e2e/fixtures/supabaseUser.ts:1`
- **Issue:** RLS via user_has_project_access is the security boundary for ~70 project-scoped tables and the org tenancy model, but there is no pgTAP suite, no `supabase test db` harness, and no supabase/tests directory (verified absent). The only automated test that touches a real RLS policy is the fab-release-gate Playwright spec (e2e/fab-release-gate.spec.ts), which is opt-in, post-deploy, non-blocking, and covers exactly one table. The 2026-06-29 tenant-isolation verification was a manual, point-in-time exercise; a future migration (a new table missing the canonical policy, or a helper-function edit) can silently regress cross-tenant isolation and nothing in CI will notice.
- **Impact:** For a multi-tenant SaaS holding contract values, budgets and drawings, an unnoticed RLS regression is a cross-tenant data breach. Enterprise security reviews specifically ask how tenant isolation is regression-tested; today the honest answer is 'manually, once'.
- **Fix:** Add an RLS regression suite. Cheapest path with existing assets: extend the e2e/fixtures/supabaseUser.ts pattern into an API-level test (two seeded users in different orgs) that asserts SELECT returns zero rows and INSERT/UPDATE are rejected across the tenant boundary for each critical table (projects, drawings, submittals, rfis, fab_release_log, sov, expenses, pay apps), run on a schedule or pre-deploy against a staging project. Longer term, pgTAP tests executed by `supabase test db` in CI against a shadow database.

```
// e2e/rls-isolation.spec.ts (API-only, no browser)
import { test, expect } from "@playwright/test";
import { signInAsTestUser, signInAsOutsiderOrNull } from "./fixtures/supabaseUser";

const TABLES = ["projects","drawings","submittals","rfis","change_orders",
  "sov_items","expenses","pay_applications","fab_release_log"];
const PROJECT_ID = process.env.E2E_FAB_PROJECT_ID || "";

test("outsider org sees zero rows and cannot write", async () => {
  const outsider = await signInAsOutsiderOrNull(); // user in a DIFFERENT org
  test.skip(!outsider || !PROJECT_ID, "set E2E_OUTSIDER_* + E2E_FAB_PROJECT_ID");
  for (const t of TABLES) {
    const { data } = await outsider.supabase.from(t)
      .select("id").eq("project_id", PROJECT_ID).limit(1);
    expect(data, `${t}: cross-tenant read`).toEqual([]);
    const { error } = await outsider.supabase.from(t)
      .insert({ project_id: PROJECT_ID });
    expect(error, `${t}: cross-tenant insert must be rejected`).toBeTruthy();
  }
});
// Manual step: provision E2E_OUTSIDER_USER/PASS in a separate test org.
```

#### 🟠 H19 · Browser E2E never gates a deploy: opt-in, post-deploy, non-blocking, prod-targeted — and possibly not running at all
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:177`
- **Issue:** The e2e-smoke job runs only when the repo variable E2E_ENABLED == 'true' (.github/workflows/ci.yml:180), runs AFTER the production deploy and is deliberately excluded from deploy.needs (ci.yml:177-179), and targets https://steelbuild-pro.com directly (ci.yml:202). UNCONFIRMED: whether E2E_ENABLED and the E2E_* secrets are actually set cannot be verified from the repo; TECH_DEBT.md:88-89 still lists 'Full-browser E2E … no signed-in Playwright flow yet' as open debt, suggesting the harness may never have been switched on. Either way, no browser-level verification can ever stop a bad build from reaching production — the class of failure the repo itself documents as its blind spot (the fab-status bug: build-green, broken in prod).
- **Impact:** A wiring/RLS/async regression invisible to jsdom-mocked tests ships to production and is discovered by paying users; detection (if the job is even enabled) happens only after prod exposure, with no rollback hook.
- **Fix:** Two steps: (1) manual — set E2E_ENABLED=true plus E2E_USER/E2E_PASS/E2E_SUPABASE_* repo secrets so the post-deploy smoke actually runs, and wire failure notifications; (2) structural — add a blocking pre-promote stage: deploy to a Vercel preview URL first, run the read-only smoke against the preview, and only then promote to production, making the smoke a gate instead of an observer.

```
# ci.yml sketch — preview-gated promote
  deploy-preview:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      # vercel pull/build, then:
      - run: echo "url=$(vercel deploy --prebuilt --token=$VERCEL_TOKEN)" >> $GITHUB_OUTPUT
        id: preview
  e2e-gate:
    needs: deploy-preview
    steps:
      - run: npm run test:e2e
        env:
          E2E_BASE_URL: ${{ needs.deploy-preview.outputs.url }}
          # existing E2E_* secrets
  promote:
    needs: e2e-gate            # E2E now BLOCKS production
    steps:
      - run: vercel promote ${{ needs.deploy-preview.outputs.url }} --token=$VERCEL_TOKEN
# Manual: set repo variable E2E_ENABLED=true + E2E_USER/E2E_PASS/
# E2E_SUPABASE_URL/E2E_SUPABASE_ANON_KEY secrets (Settings > Actions).
```

#### 🟡 M29 · No code-coverage measurement, thresholds, or reporting anywhere
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `vite.config.js:147`
- **Issue:** There is no coverage tooling at all: no @vitest/coverage-v8 (or istanbul/c8) in devDependencies (package.json:90-122), no coverage block in the vitest config (vite.config.js:147-169), no coverage step or artifact in CI (.github/workflows/ci.yml:100-101). Nobody can state what fraction of the 31 hooks (7 tested), 87 route pages, or financial paths is exercised, and coverage regressions are invisible.
- **Impact:** Enterprise buyers and SOC2-style vendor reviews ask for coverage evidence; internally, a refactor that silently drops tests or leaves new money/RBAC code untested produces no signal. The strong existing suite cannot be defended or ratcheted without measurement.
- **Fix:** Add @vitest/coverage-v8, enable v8 coverage in the vitest config with lcov+text reporters, set per-glob thresholds on the crown-jewel directories (src/lib/payapp, src/services, src/lib) so they can never regress, and upload lcov as a CI artifact. Start with observed baselines, then ratchet — same philosophy as the typecheck ratchets.

```
// vite.config.js  (test block)
test: {
  // ...existing config...
  coverage: {
    provider: 'v8',
    reporter: ['text-summary', 'lcov'],
    include: ['src/**', 'supabase/functions/**'],
    exclude: ['src/components/ui/**', 'src/dev/**', '**/__tests__/**'],
    thresholds: {
      // global baseline — set to measured value, never lower it
      lines: 40,
      // crown jewels pinned high
      'src/lib/payapp/**': { lines: 90, branches: 85 },
      'src/services/**':   { lines: 80 },
      'src/lib/money*':    { lines: 95 },
    },
  },
}
// package.json: "test:coverage": "vitest run --coverage"
// ci.yml: run test:coverage instead of test; upload coverage/ as artifact
```

#### 🟡 M30 · Edge functions are almost entirely untested and outside every typecheck/lint gate
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/functions/llm-proxy/quota.ts:1`
- **Issue:** Of the 7 deployed Deno edge functions, only stripe-billing has any test (one pure-logic file: supabase/functions/stripe-billing/__tests__/webhookReplay.test.ts). llm-proxy's spend-control logic (quota.ts fail-open/fail-closed per-user cost caps, providers/cost.ts model allowlist, router.ts provider routing), email-send, email-ingest, project-export (RLS-scoped tenant export), _shared/attachments.ts (upload guard) and _shared/cors.ts (origin allowlist that also guards the Stripe redirect target) have zero tests. Worse, tsconfig.json include is src/** only (tsconfig.json:25) and there is no `deno check` step in CI, so a type or syntax error in an edge function is caught by nothing before a manual `npx supabase functions deploy` ships it to production.
- **Impact:** A regression in quota.ts can silently fail open (uncapped LLM spend) or fail closed (all AI features down); a cors.ts regression already broke prod AI once per the repo's own memory. These are the functions handling billing, tenant export, and external spend — the highest-blast-radius server code in the product — with the weakest gate.
- **Fix:** Replicate the webhookLogic pattern: extract the pure decision logic of quota.ts, providers/cost.ts, _shared/cors.ts (isAllowedOrigin) and _shared/attachments.ts into importable modules with colocated Vitest tests (the Vitest config already picks up supabase/** tests). Add a CI step running `deno check` over supabase/functions so every function at least type-parses before deploy.

```
# .github/workflows/ci.yml — add to the ci job
- name: Typecheck edge functions (Deno)
  uses: denoland/setup-deno@v2
  with:
    deno-version: v2.x
- name: deno check supabase functions
  run: |
    for f in supabase/functions/*/index.ts; do
      deno check --quiet "$f"
    done

// And per function, extract + test pure logic (pattern already proven):
// supabase/functions/llm-proxy/quotaLogic.ts  -> pure decide(usage, limits)
// supabase/functions/llm-proxy/__tests__/quotaLogic.test.ts (runs under Vitest)
import { describe, it, expect } from "vitest";
import { decideQuota } from "../quotaLogic.ts";
it("expensive use-case fails CLOSED when usage lookup errors", () => {
  expect(decideQuota({ usageError: true, expensive: true }).allowed).toBe(false);
});
it("cheap call fails OPEN when usage lookup errors", () => {
  expect(decideQuota({ usageError: true, expensive: false }).allowed).toBe(true);
});
```

#### 🟡 M31 · E2E suite does not exercise the killer workflow's mutations end to end
- **Severity:** medium · **Effort:** L · **Manual step** · CONFIRMED
- **Location:** `e2e/daily-workflow.spec.ts:13`
- **Issue:** The entire browser E2E surface is four specs: an auth-shell boot smoke (e2e/smoke.spec.ts), three read-only 'register renders' checks for /Drawings, /Submittals, /RFIs (e2e/daily-workflow.spec.ts:13-31) with deliberately loose assertions (URL held + body contains a keyword + no pageerror, per e2e/README.md:125-127), and an API-level (not browser) fab-gate spec. Nothing drives the moat workflow through the real UI: login → create project → upload a drawing set → submittal stage transition (IFA→…→Released for Fab) → fab release via ExportFabReleaseModal. The practical blocker is fixture provisioning — a seeded staging org with a test account (auth against live Supabase), which the README itself flags as the owner step.
- **Impact:** The revenue-critical workflow (the product's stated moat) can break in the UI layer — a modal that no longer opens, an upload path regression, a stage-transition button wired to a dead mutation — while all gates stay green. Deep-links, uploads and mutations are precisely where jsdom mocks prove nothing.
- **Fix:** Seed a dedicated staging/test org with one sample project (manual, one-time), then extend the harness with a mutation spec per killer-workflow step using stable data-testid selectors: upload a small fixture PDF through DrawingSetUploadModal, advance a submittal one stage, create an RFI, and run fab release with an override reason. Keep it pointed at the test org only (same convention as fab-release-gate.spec.ts) and fold it into the pre-promote gate once stable.

```
// e2e/killer-workflow.spec.ts (test org only)
test("submittal stage transition persists", async ({ page }) => {
  await page.goto("/Submittals");
  await page.getByTestId("submittal-row").first().click();
  await page.getByTestId("stage-advance").click();      // IFA -> OFA
  await expect(page.getByTestId("stage-badge")).toHaveText("OFA");
  await page.reload();                                   // server persisted?
  await expect(page.getByTestId("stage-badge")).toHaveText("OFA");
});

test("drawing set upload creates sheets", async ({ page }) => {
  await page.goto("/Drawings");
  await page.getByTestId("upload-set").click();
  await page.setInputFiles('input[type="file"]', "e2e/fixtures/tiny-set.pdf");
  await page.getByTestId("confirm-create").click();
  await expect(page.getByText("tiny-set")).toBeVisible();
});
// Manual: seed staging org + add data-testid attrs to the modals.
```

#### ⚪ L30 · Permissive any-chain Supabase mocks let query-shape regressions pass every test
- **Severity:** low · **Effort:** M · CONFIRMED
- **Location:** `src/__tests__/components/Submittals.test.jsx:39`
- **Issue:** Component/page tests mock the data layer with unconditional stubs: the entities surface is a Proxy returning the same noop for ANY entity name, and supabase.from() returns a chain object whose select/eq/order all return themselves and resolve to empty data (src/__tests__/components/Submittals.test.jsx:15-51; the same pattern is repeated per-file across the 27 jsdom suites rather than shared). A typo'd table name, a wrong filter column, a removed RPC, or an invalid builder chain all pass tests and only fail at runtime in production — exactly the failure class the repo's own 'done means field-verified' doctrine documents.
- **Impact:** The jsdom layer certifies 'renders without crashing' but silently certifies nothing about data access; combined with the non-blocking E2E this means the whole path from React Query hook to PostgREST is unverified by any gate.
- **Fix:** Create one shared mock helper (src/test-utils/mockSupabase.ts) that (a) validates requested entity/table names against the generated src/types/supabase.ts row types (throw on unknown table — turns typos into test failures), and (b) records builder calls so tests can assert the filter actually applied (e.g. eq('project_id', …) present on project-scoped queries). Migrate suites to it incrementally; add a thin nightly contract-test job against `supabase start` for the top 5 hooks.

```
// src/test-utils/mockSupabase.ts
import type { Database } from "@/types/supabase";
type TableName = keyof Database["public"]["Tables"];
const KNOWN = new Set<string>(/* generated list or Object.keys at build */);

export function mockSupabase(data: Partial<Record<TableName, unknown[]>> = {}) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const from = (table: string) => {
    if (!KNOWN.has(table)) throw new Error(`Unknown table in test: ${table}`);
    const rows = (data as Record<string, unknown[]>)[table] ?? [];
    const chain: any = new Proxy({}, {
      get: (_t, method: string) => {
        if (method === "then") return (res: any) => res({ data: rows, error: null });
        return (...args: unknown[]) => { calls.push({ table, method, args }); return chain; };
      },
    });
    return chain;
  };
  return { supabase: { from, rpc: vi.fn(), auth: stubAuth() }, calls };
}
// test: expect(calls).toContainEqual({ table: "submittals", method: "eq",
//   args: ["project_id", TEST_PROJECT.id] })  // proves project scoping
```

#### ⚪ L31 · Windows-local test runs need --maxWorkers=2 but nothing encodes it
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `vite.config.js:168`
- **Issue:** The suite is known to flake on Windows unless run with --maxWorkers=2 (documented only in docs/HANDOFF-2026-06-27-industrial-command-system.md:85 — 'vitest needs --maxWorkers=2 on Windows'), yet the npm test script is a bare `vitest run` (package.json:22) and the vitest config sets pool:'threads' with no worker cap (vite.config.js:168). CI (Linux) is unaffected, but the primary development machine is Windows.
- **Impact:** Local full-suite runs intermittently crash/hang for Windows contributors, so the pre-deploy validation ladder gets skipped or distrusted ('it always flakes locally, CI will catch it') — quietly weakening the local half of the quality gate.
- **Fix:** Encode the cap in config so nobody has to remember the flag: limit maxThreads on win32 in the vitest test block (CI on Linux keeps full parallelism).

```
// vite.config.js test block
test: {
  // ...
  pool: 'threads',
  poolOptions: {
    threads: process.platform === 'win32'
      // Windows: >2 workers intermittently crash/hang the suite
      // (see docs/HANDOFF-2026-06-27). Linux CI keeps defaults.
      ? { maxThreads: 2, minThreads: 1 }
      : {},
  },
}
```

#### ⚪ L32 · Gate polish: lint warnings suppressed, e2e specs never linted, no vitest report artifact, no a11y/bundle budgets
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `eslint.config.js:43`
- **Issue:** Four small quality-gate leaks: (1) CI lint runs `eslint . --quiet` (package.json:13, ci.yml:67-71) so the acknowledged large warning backlog is invisible and can grow unbounded; (2) eslint's root ignores exclude e2e/** entirely (eslint.config.js:43), so the Playwright specs — production-facing code — are never linted or typechecked (tsconfig also excludes them); (3) the Vitest CI step emits no junit/machine-readable report artifact, so test history/flake tracking is impossible from CI; (4) no a11y or bundle-size budget jobs, acknowledged as queued in ci.yml:20.
- **Impact:** Warning debt grows silently; e2e code rots ungated; there is no data trail to identify flaky tests; bundle/a11y regressions ship unnoticed. Individually minor, collectively the difference between a gate and a sieve.
- **Fix:** Add a warning-count ratchet (record the current count, fail CI if it grows), include e2e/**/*.ts in a lint/tsc block, add a junit reporter + artifact upload to the Vitest step, and a simple dist-size budget check after the build step.

```
# ci.yml — vitest report artifact
- name: Run Vitest tests
  run: npx vitest run --reporter=default --reporter=junit --outputFile=vitest-junit.xml
- uses: actions/upload-artifact@v4
  if: ${{ !cancelled() }}
  with: { name: vitest-report, path: vitest-junit.xml }

# warning ratchet (replace --quiet)
- name: Lint (warning ratchet)
  run: npx eslint . --max-warnings "$(cat .eslint-warning-budget)"
  # .eslint-warning-budget holds the current count; shrink-only, like the TS ratchets

// eslint.config.js — lint the e2e specs instead of ignoring them
// remove "e2e/**" from the root ignores and add:
{ files: ["e2e/**/*.ts"], languageOptions: { globals: globals.node } }
```

#### ⚪ L33 · A full stale app snapshot (967 tracked files, incl. 54 outdated test files) is committed under .claude/worktrees
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `.claude/worktrees/gifted-rhodes-7af818:1`
- **Issue:** origin/main tracks 967 files under .claude/worktrees/ (verified via git ls-files), including .claude/worktrees/gifted-rhodes-7af818 — a complete stale copy of the app with 54 outdated duplicates of the test suite (e.g. an old submittalStageMapping.test.js and a pccEngine.test.js for a module deleted from the live tree). Vitest, eslint and tsconfig all exclude .claude/**, so gates are unaffected, but every repo-wide scan (auditors, knip, ripgrep, licensing/security tooling, this very audit's '271 test files' count vs the 220 live ones) double-counts or matches dead code.
- **Impact:** Audit and tooling noise, inflated/incorrect metrics presented to enterprise reviewers, risk of an agent or contributor 'fixing' the stale copy, and unnecessary repo bloat. A due-diligence code scan will flag the deleted pccEngine and other retired modules as live code.
- **Fix:** Delete the tracked .claude/worktrees content from the index and gitignore the directory so session worktrees can never be committed again (this is local agent-session state, not source).

```
# one-time cleanup (on a feature branch, per repo git-safety rules)
git rm -r --cached .claude/worktrees
printf '\n# agent session worktrees are local state, never source\n.claude/worktrees/\n' >> .gitignore
git add .gitignore
git commit -m "chore: untrack stale .claude/worktrees session snapshots"
```

### Frontend architecture & tech debt

The frontend is in materially better architectural shape than a typical fast-moving solo SaaS: zero import cycles across 1,005 src modules (verified by full-graph SCC analysis), CI-enforced strictNullChecks/noImplicitAny ratchets whose ignore lists are already down to 1 and 10 files, a working large-file decomposition campaign (only 3 files over 1,500 lines excluding generated types), and genuine dead-code discipline (moduleGating, GanttChart.tsx, importAnalyzedDrawings.js, mockData.js all actually deleted). The two biggest enterprise-maintainability risks are (1) repository hygiene on origin/main — a full 964-file stale duplicate of the app is committed under .claude/worktrees plus three dangling gitlink entries that present as broken submodules to every fresh clone, alongside ~95MiB of pack bloat from historically committed node_modules/dist — and (2) the command_ui redesign debt: the flag is globally on, yet ~27 pages carry two complete render implementations (legacy dark + new Control Center), effectively doubling the maintained UI surface across two parallel design systems (83 sbd-* files vs 27 command-kit files) with no written convergence plan. Documentation is unusually rich but drifting: README, ARCHITECTURE.md, and TECH_DEBT.md all still describe the retired 'Vercel auto-deploys from main' model, and TECH_DEBT.md's counts/claims lag reality by 2+ weeks. Error-state handling is the weakest runtime pattern: most page queries default to [] and surface neither user-facing errors nor Sentry events, so fetch failures read as empty projects. None of this blocks operating today, but the worktree cleanup, flag retirement plan, and doc refresh are what an enterprise code diligence pass would flag in the first hour.

**Strengths:**
- Zero circular imports across all 1,005 non-test src modules (verified via Tarjan SCC over the full static+dynamic import graph, @/ alias and relative) — clean layering, e.g. src/api/supabaseClient.ts imports only lib leaf modules.
- Type-safety ratchets are real and CI-enforced, not aspirational: scripts/strict-typecheck.mjs STRICT_NULL_IGNORE is down to 1 file (src/pages/ResourceScheduling.tsx) and scripts/noimplicitany-typecheck.mjs NOIMPLICITANY_IGNORE to 10 files, with shared filter tooling (scripts/lib/tscDiagnostics.mjs), a 'shrink, never grow' contract in-code, and a design doc (docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md).
- Large-file decomposition campaign is working: largest component is ScheduleGantt.jsx at 2,057 lines (down from 2,812), and only 3 files exceed ~1,500 lines (ScheduleGantt.jsx 2,057, PortfolioView.jsx 1,638, Schedule.tsx 1,503) excluding the generated src/types/supabase.ts; the extract-pure-logic-with-tests pattern is documented in AGENTS.md and consistently applied (scheduleGanttHelpers, portfolioDerive, *ControlCenter.derive.ts modules).
- Dead code from retired subsystems was actually deleted, not stranded: moduleGating/useModuleAccess have zero references, src/pages/GanttChart.tsx is gone, src/lib/importAnalyzedDrawings.js is gone (only a comment survives), src/dev/mockData.js is gone, and src/components/desktop/module/index.js is trimmed to the 2 primitives the live hub consumes with an explanatory comment.
- Feature-flag count is disciplined: only 3 active flag keys in src (command_ui, revision_ai_diff, viewer_3d) — no flag graveyard.
- ESLint flat config now covers the full JS AND TS surface including src/lib and src/api (only vendored src/components/ui and vite-plugins exempt), with unused-imports as errors and no-undef restored, each with in-code rationale.
- Documentation depth is unusual for the team size: README with an explicit new-contributor reading order, 38KB ARCHITECTURE.md with decision log, TECH_DEBT.md with per-item remediation paths, AGENTS.md contributor guide, .env.example, and dated design specs under docs/superpowers/.
- Migration history was re-baselined cleanly (3 baseline files + 9 timestamped follow-ups; the 190 originals preserved in supabase/migrations_archive/), and package.json now carries an engines pin.
- Single page-registry source of truth (src/config/routes.js) with lazy-loaded routes, and a two-tier error-boundary design (top-level + per-route section) with Sentry capture in both.


#### 🟠 H20 · command_ui dual-render debt: ~27 pages ship two complete implementations with the flag globally on
- **Severity:** high · **Effort:** L · CONFIRMED
- **Location:** `src/pages/Deliveries.tsx:481`
- **Issue:** The command_ui flag is checked at 31+ call sites across ~27 route pages plus the shell (src/boot/LayoutRoute.jsx:21). Each page keeps the full legacy dark-theme render path AND the new Control Center path behind an if (commandUi) branch — e.g. src/pages/Deliveries.tsx:97 declares the flag and line 481 branches to DeliveryControlCenter, leaving several hundred lines of legacy render below it; same pattern in Dashboard.jsx:91/354 and ~25 more pages. With the flag globally enabled, the legacy branches are unreachable in production but still compiled, shipped, linted, typed, and bug-fixed. The flag also couples to theming (LayoutRoute.jsx:27-30 force-flips the app to light theme). CLAUDE.md §24 itself forbids leaving dead flag checks after full release.
- **Impact:** The maintained UI surface is roughly doubled across the app's most-used screens: every cross-cutting change (RBAC gate, query key, audit call) must be made or consciously skipped in two implementations, and a fix applied only to the dead legacy path silently no-ops in production. This is the single largest ongoing frontend maintenance cost and a visible red flag in any code review an enterprise buyer commissions.
- **Fix:** Finish the owner's field-verification of the Control Centers (the flag is currently the rollback lever, so this is sequenced, not accidental, debt), then delete the legacy branch page-by-page (one commit per page, full suite + build each), and finally retire the command_ui flag and the LayoutRoute theme coupling. Track the burndown as a first-class TECH_DEBT.md item with the page list.

```
// per page, after field-verify — e.g. src/pages/Deliveries.tsx
- const commandUi = useFlag("command_ui");
  ...
- if (commandUi) {
-   return <DeliveryControlCenter ... />;
- }
- /* ~500 lines of legacy sbd-* render — DELETE */
+ return <DeliveryControlCenter ... />;
// then remove the flag row from feature_flags and the LayoutRoute setTheme coupling
```

#### 🟠 H21 · Query failures render as empty data with no user feedback and no Sentry signal
- **Severity:** high · **Effort:** M · CONFIRMED
- **Location:** `src/lib/query-client.ts:5`
- **Issue:** src/lib/query-client.ts (lines 5-26) configures retry/staleTime only — there is no QueryCache onError, no throwOnError, and no global error surface. Pages overwhelmingly destructure with empty-array defaults and ignore the error state (e.g. src/pages/Deliveries.tsx:119 `const { data: deliveries = [], isLoading }`): only ~10 of the ~75+ page files reference isError/error at all. React Query catches the rejection, so Sentry's global unhandledrejection handler never fires either — the failure is invisible to both the user and monitoring.
- **Impact:** An RLS denial, expired session, network failure, or 500 renders as a clean empty list indistinguishable from 'no data'. In this domain that is a data-trust hazard: a PM can read 'no open RFIs / no deliveries' from what is actually a fetch error, and support gets no Sentry event to debug from. An enterprise pilot with a permissions misconfiguration would hit this immediately and conclude data loss.
- **Fix:** Add a global QueryCache onError that reports to Sentry and toasts on first-load failures (stay quiet on background refetches that still have cached data), and add a standard error state to the shared Control Center kit so new pages inherit it.

```
// src/lib/query-client.ts
import { QueryCache, QueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';

export const queryClientInstance = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      Sentry.captureException(error, {
        tags: { source: 'react-query' },
        contexts: { query: { key: JSON.stringify(query.queryKey) } },
      });
      // Only interrupt the user when there is no cached data to show.
      if (query.state.data === undefined) {
        toast.error('Failed to load data — check your connection and retry.');
      }
    },
  }),
  defaultOptions: { /* keep existing retry/staleTime block */ },
});
```

#### 🟡 M32 · Full agent-worktree snapshot (964 files, ~26MB) and 3 dangling gitlinks committed on origin/main
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `.claude/worktrees/gifted-rhodes-7af818:1`
- **Issue:** At HEAD (642ce154), .claude/worktrees/gifted-rhodes-7af818 is tracked as a normal tree: 964 files including a complete stale duplicate of the app (830 src files), a second package-lock.json, and two ~4.7MB web-ifc wasm bundles plus the retired @thatopen fragments worker. Three sibling entries (.claude/worktrees/desktop-redesign, happy-feistel-bdb01d, quirky-cartwright-81c4f1) are committed as mode-160000 gitlinks with no .gitmodules, i.e. broken phantom submodules. .gitignore (line 20) only excludes .claude/settings.local.json, not .claude/worktrees/.
- **Impact:** Every fresh clone/CI checkout gets ~26MB of stale duplicate code plus submodule entries that cannot be initialized (git submodule commands error; git status permanently shows them as modified — visible in the main checkout's status today). Repo-wide grep/IDE search returns hits from the dead copy, including code deleted from the live tree (the old @thatopen viewer), which directly misleads dead-code reachability checks and agent sessions. An enterprise code-diligence clone hits this in the first minutes.
- **Fix:** Untrack the whole worktrees subtree, add it to .gitignore, and commit. Do NOT rewrite history (shared multi-agent repo) — just stop tracking. Verify only ~4 intentional .claude files (settings.json, hooks, agent-memory) remain tracked.

```
# on a feature branch off main
git rm -r --cached ".claude/worktrees"
printf '\n# agent worktrees are local-only\n.claude/worktrees/\n' >> .gitignore
git add .gitignore
git commit -m "chore: untrack agent worktrees (stale 964-file snapshot + 3 dangling gitlinks)"
# verify
git ls-files .claude   # expect only settings.json, hooks/, agent-memory/
```

#### 🟡 M33 · Deploy model documented wrong in 3 of 4 living docs (README, ARCHITECTURE, TECH_DEBT)
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `TECH_DEBT.md:118`
- **Issue:** README.md:25 ('Vercel — auto-deploys from main'), ARCHITECTURE.md:40 ('Hosting: Vercel auto-deploys from main'), and TECH_DEBT.md:118 ('CI is advisory on the deploy path… a red run on main does not stop the direct-push Vercel deploy') all describe the pre-2026-06-19 model. The actual model (per .github/workflows/ci.yml header and vercel.json) is the opposite: Vercel git auto-deploy is OFF and the CI deploy job is the sole production path — a red push cannot deploy. ARCHITECTURE.md contains zero mention of the gated deploy job.
- **Impact:** During an incident or onboarding, a dev following the prescribed reading order (README → ARCHITECTURE → TECH_DEBT) gets a materially wrong mental model of how production ships and what a red CI run means. TECH_DEBT.md even presents an already-fixed risk as open, eroding trust in the whole register. Only CLAUDE.md and the ci.yml comments are correct.
- **Fix:** Update the three docs to state: push to main → ci job (lint/typechecks/tests/build) → deploy job ships prebuilt output to Vercel; Vercel git auto-deploy disabled via vercel.json git.deploymentEnabled.main=false; red CI = no deploy. Delete the stale 'CI is advisory' item from TECH_DEBT.md (replace with the true residual: no branch protection on a free-plan private repo).

```
# README.md:25 / ARCHITECTURE.md:40 — replace with:
- **Hosting**: Vercel. Production deploys are CI-gated: a push to `main`
  runs `.github/workflows/ci.yml` (lint + 4 typechecks + tests + build) and
  only a green run triggers the `deploy` job (`vercel deploy --prebuilt --prod`).
  Vercel's own git auto-deploy is OFF (`vercel.json` → `git.deploymentEnabled.main: false`).

# TECH_DEBT.md:118 — delete the "CI is advisory" bullet; note instead that
# branch protection is unavailable on the current GitHub plan (the residual risk).
```

#### 🟡 M34 · TECH_DEBT.md is 2+ weeks stale on verifiable facts and omits the largest active initiative
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `TECH_DEBT.md:72`
- **Issue:** The register (header 'Updated 2026-06-16', TECH_DEBT.md:11) is wrong on multiple checkable claims: JS/TS counts '878 vs 155' (line 72; actual on main: 945 JS/JSX vs 275 TS/TSX), 'strict:false today' (line 74; the strictNullChecks + noImplicitAny CI ratchets shipped 2026-06-22), 'formatCurrency redefined in 4 places' (line 124; now 3 — pages/reports/utils.js was fixed), 'src/dev/mockData.js ships inside src/' (line 129; file deleted), 'package.json has no engines pin' (line 129-130; engines exists at package.json:6). It also contains no entry at all for the command_ui dual-render program — the largest live frontend debt — nor for the committed-worktree problem.
- **Impact:** TECH_DEBT.md is the designated diligence artifact ('known issues + remediation paths' per the README reading order). When its checkable claims are wrong, an auditor must re-derive everything from the tree, and real debt (dual render paths, repo hygiene) is invisible to anyone triaging from the register. Doc drift here has already produced contradictory guidance once (the deploy-model item above).
- **Fix:** Do a dated refresh pass: correct the five stale claims, add entries for (a) command_ui legacy-path burndown with the page list, (b) .claude/worktrees untracking, (c) dual design-system convergence. Adopt the convention that any item touched by a shipped change gets moved to Recently-resolved in the same PR.

#### 🟡 M35 · Generated Supabase types omit the entire org/billing/tenancy layer
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `src/types/supabase.ts:1`
- **Issue:** src/types/supabase.ts (7,422 lines) contains zero type entries for `organizations` (verified by search) — the organizations/organization_members/organization_invitations/billing tables shipped 2026-06-13 were never regenerated into the types file. TECH_DEBT.md:66-68 flags this ('regenerate via the Supabase MCP on the next pass') but it remains unresolved.
- **Impact:** The CI claim that 'typecheck guards Supabase table names' (ci.yml comment) does not hold for the newest, most commercially critical tables: all org/billing access from TS goes through untyped or permissively-cast paths, so a renamed column or wrong table string in the tenancy/billing layer compiles clean. This also blocks typing the shared entity surface, which CLAUDE.md names as the prerequisite for shedding the ~96 `as any` boundary casts counted in src.
- **Fix:** Regenerate types against the live project (npm run types:db or the Supabase MCP generate_typescript_types), commit the refreshed src/types/supabase.ts, and diff-review for accidental schema drift. Add a periodic reminder (or a CI drift check comparing generated output) so it cannot lag a schema change by weeks again.

```
# requires SUPABASE_ACCESS_TOKEN / project ref (owner secret)
npm run types:db
# or via MCP: generate_typescript_types → overwrite src/types/supabase.ts
git diff --stat src/types/supabase.ts   # expect organizations/billing tables to appear
npx vitest run && npm run typecheck && npm run typecheck:strict
```

#### 🟡 M36 · TS conversion trajectory is not converging: net-new JS still being authored
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `tsconfig.json:8`
- **Issue:** The tree is 945 JS/JSX vs 275 TS/TSX files (22.5% TS). Against TECH_DEBT.md's 2026-06-17 measurement (878 JS / 155 TS), TS grew +120 files but JS also grew +67 — recent features (Billing.jsx, OrgMembers.jsx, FieldToday.jsx, FieldHub.jsx, many command-era pages) landed as new .jsx. Base tsconfig.json keeps strict/noImplicitAny/strictNullChecks all false (lines 8-10), so the strong gates only protect the 22.5% TS surface; ~96 `as any` casts remain in the TS files as boundary tax against untyped JS.
- **Impact:** The conversion is a treadmill: the denominator grows as fast as files convert, the strict ratchets' coverage stays capped near a fifth of the codebase, and every page conversion keeps re-paying the boundary-cast tax against untyped shared JS (ProjectContext, design-system primitives). At this rate the 'mixed JS/TS' liability an enterprise reviewer flags persists indefinitely.
- **Fix:** Add a CI check that blocks NEWLY ADDED .js/.jsx files under src (edits to existing files stay allowed), and prioritize typing the shared infra CLAUDE.md already names (ProjectContext, design-system primitives, supabaseClient entity surface) so page conversions stop minting casts.

```
# .github/workflows/ci.yml — add step after checkout (fetch-depth: 0)
- name: Block new JS files (write TS)
  run: |
    git fetch origin main --depth=50
    NEW_JS=$(git diff --name-only --diff-filter=A origin/main...HEAD \
      -- 'src/**/*.js' 'src/**/*.jsx' | grep -v '__tests__' || true)
    if [ -n "$NEW_JS" ]; then
      echo 'New JS/JSX files added — author these as .ts/.tsx:'; echo "$NEW_JS"; exit 1
    fi
```

#### 🟡 M37 · Junk artifacts committed at repo root, including a mangled-path file with a private-use Unicode character
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `pro-pricing-live.png:1`
- **Issue:** Tracked at HEAD: (1) a file whose name is a flattened Windows scratchpad path — 'CUsersNicholasAppDataLocalTempclaude…scratchpadcontrast_check.js' (the ':' encoded as U+F03A private-use char, which is why git quotes it) — clearly an accidental commit of an agent scratch file; (2) pro-pricing-live.png (89KB screenshot) at root; (3) AUDIT_PHASE_1_INVENTORY.md (audit scratch). Additionally the object store carries historical commits of node_modules, dist/assets bundles (2.4MB index-*.js), and worktree wasm — pack size 94.9MiB (git count-objects). The locally-observed 'undefined/' directory is NOT committed (verified absent at HEAD — local-only junk).
- **Impact:** The PUA-character filename risks checkout/tooling failures on strict filesystems and code scanners, and screams unreviewed-commit hygiene to any auditor. The ~95MiB pack (for a frontend app whose live tree is a fraction of that) slows every clone and CI checkout; the node_modules/dist blobs are permanent unless history is rewritten.
- **Fix:** git rm the three root artifacts (relocate AUDIT_PHASE_1_INVENTORY.md to docs/ if still wanted). Accept the historical pack bloat for now (history rewrite is unsafe in this multi-agent shared repo) but prevent recurrence: .gitignore dist/ is already present — the worktree untracking in the other finding stops the biggest bleed. Separately delete the untracked local 'undefined/' directory in the main checkout.

```
git rm "C$(printf '')UsersNicholasAppDataLocalTempclaudeC--dev-SteelBuild-Pro-Rev-24f9dab6f-25e4-4b7a-8b0e-0f15db6950e9scratchpadcontrast_check.js"
# (or: git ls-files | grep contrast_check | xargs -d '\n' git rm)
git rm pro-pricing-live.png
git mv AUDIT_PHASE_1_INVENTORY.md docs/audits/  # or git rm
git commit -m "chore: remove accidental root artifacts"
```

#### ⚪ L34 · Dead desktop.css shipped globally; stale DesktopShell references linger
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/main.jsx:10`
- **Issue:** src/main.jsx:10 unconditionally imports @/styles/desktop.css (173 lines), but every rule is scoped to [data-skin="desktop"] and nothing sets that attribute anymore — the only skin setter is useCommandSkin.ts which sets 'command' (DesktopShell was removed when desktop_shell was retired). The JSDoc in src/boot/LayoutRoute.jsx:11-12 still says the component 'Chooses DesktopShell (flag: desktop_shell) or the classic Layout', which the code no longer does.
- **Impact:** Dead CSS is parsed by every user on every load (small but pure waste), and the stale comment sends readers hunting for a DesktopShell component that does not exist. Both are exactly the 'dead flag check' residue CLAUDE.md §24 says to clean.
- **Fix:** Delete src/styles/desktop.css and the import in main.jsx; rewrite the LayoutRoute JSDoc to describe what it does now (mounts Layout once, defaults theme to light under command_ui). Keep src/components/desktop/module/ — its two primitives are live in the Detailing hub.

```
// src/main.jsx
- import "@/styles/desktop.css"

// src/boot/LayoutRoute.jsx JSDoc
- * Chooses DesktopShell (flag: desktop_shell) or the classic Layout. Both render
- * the page <Outlet>, so all routes work identically under either shell.
+ * Mounts the classic Layout once across navigations and defaults the shell
+ * to the light theme while the command_ui redesign flag is on.

# then: git rm src/styles/desktop.css
```

#### ⚪ L35 · Naming collisions and convention drift: two identically-named ErrorBoundaries, 'Command Center' overloaded three ways, mixed folder casing
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/components/shared/ErrorBoundary.jsx:1`
- **Issue:** (1) src/components/ErrorBoundary.jsx (top-level, full-screen recovery) and src/components/shared/ErrorBoundary.jsx (per-route section boundary with label prop) are different components with the same filename and default export — a deliberate two-tier design, but imports are distinguishable only by path. (2) 'Command' now means three things: pages/CommandCenter.jsx (the ops feed page), src/components/command/ (the light design kit), and the ~27 *ControlCenter.tsx page implementations — plus components/commandcenter/ (lowercase, the ops-feed widgets). (3) Page-folder casing is inconsistent: pages/dashboardCC vs pages/dashboard, components/workpackages vs pages/workPackages, components/commandcenter vs pages/commandCenter.
- **Impact:** Wrong-import risk on the boundaries (the two behave differently on failure), and real navigation friction for a new dev: grep for 'command' returns four unrelated subsystems, and case-inconsistent folders break muscle memory and can bite on case-sensitive CI filesystems if a path is typed from memory.
- **Fix:** Rename the section boundary (component + file) to SectionErrorBoundary and update its ~import sites; document the folder-naming convention (camelCase page folders, one casing for component domains) in AGENTS.md and apply it to new folders only — do not mass-rename existing paths.

```
// src/components/shared/ErrorBoundary.jsx → SectionErrorBoundary.jsx
-class PageErrorBoundary extends React.Component {
+class SectionErrorBoundary extends React.Component {
// callers (e.g. src/boot/LayoutRoute.jsx:3)
-import PageErrorBoundary from "@/components/shared/ErrorBoundary";
+import SectionErrorBoundary from "@/components/shared/SectionErrorBoundary";
```

#### ⚪ L36 · AGENTS.md contributor guide stale on migrations count, lint exemptions, and typecheck commands
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `AGENTS.md:10`
- **Issue:** AGENTS.md says supabase/migrations is '~170' files (actual: 12 after the 2026-06-20 re-baseline, with 190 in migrations_archive/), says 'src/lib, src/api, and src/components/ui are lint-exempt' (eslint.config.js now lints src/lib and src/api — only components/ui and vite-plugins are exempt), describes TypeScript as simply 'non-strict (strict: false)' without mentioning the two CI-enforced ratchet gates, and omits npm run typecheck:strict / typecheck:noimplicitany from the commands list.
- **Impact:** This is the designated quick contributor guide; a new dev (or agent) following it will under-lint their expectations, look for ~170 migrations that aren't there, and miss the two CI gates that will actually fail their PR — the exact bus-factor documentation this file exists to provide.
- **Fix:** One-pass refresh of AGENTS.md: correct the migrations sentence (12 files + archive), the lint-exemption list, add the two ratchet commands with a one-line explanation of the shrink-only ignore lists, and note the CI-gated deploy model.

#### ⚪ L37 · Side-project deliverables and unwired dead-code tooling in the app repo
- **Severity:** low · **Effort:** M · **Manual step** · unverified-low
- **Location:** `knip.json:1`
- **Issue:** exports/ (785KB: an .xlsx workbook, Python build scripts, and data for the separate Excel VBA client app) and standalone/motion-construction-ai (48KB) are tracked in the SaaS repo but are not part of the application build. knip is installed as a devDependency with a root knip.json, but no npm script references it and it does not run in CI — the dead-code detector exists but never executes.
- **Impact:** Unrelated deliverables blur the repo boundary (they show up in searches, audits, and licensing scans of 'the product'), and the unwired knip config gives false comfort that dead-export detection is happening. Both are polish-level, but easy wins before external code review.
- **Fix:** Move exports/ and standalone/ to their own repos (the Excel client already has an established identity), or at minimum document them as non-product in README. Wire knip as an advisory CI step (continue-on-error) and add an npm script so it actually runs.

```
// package.json scripts
+  "knip": "knip",

# .github/workflows/ci.yml (advisory)
- name: Dead-export scan (advisory)
  run: npx knip || true
```

### Auth & session security

Core authentication architecture is sound for a single-factor SaaS: Supabase email+password with server-authoritative role resolution (user_profiles.role via RLS, metadata privilege-stripping, a DB trigger blocking role self-updates), a well-designed invitation flow (random UUID tokens, 14-day expiry, email binding, seat-limit enforcement in the accept RPC), clean secret hygiene (no service keys or provider secrets can reach the bundle), and DB-enforced admin surfaces. However, the account-lifecycle layer an enterprise buyer tests on day one is largely missing: there is no password reset or change-password flow anywhere in the app (a locked-out user cannot self-recover), no MFA enrollment or enforcement, no SSO/SAML/SCIM, and no automated invite emails (admins hand-copy links). Session hygiene has gaps — logout does not clear the React Query cache or the field offline outbox, so on shared devices (common in construction trailers) a subsequent user can see or write as the prior tenant — and tokens sit in localStorage with the CSP still in Report-Only mode. Several critical protections (password policy, leaked-password protection, email confirmation, auth rate limits) live in the Supabase dashboard and cannot be verified from the repo; they need a manual audit pass. Nothing here is a live breach, but the reset/MFA/SSO trio is the biggest readiness gap in this domain.

**Strengths:**
- Server-authoritative RBAC in the auth layer: role always read from user_profiles (RLS-protected), never client-writable user_metadata; stripPrivilegeMeta + a BLOCKED_FIELDS deny-list in updateMe close the metadata escalation path (src/lib/AuthContext.tsx:56-86, src/api/supabaseClient.ts:1006-1042), and a BEFORE UPDATE trigger makes user_profiles.role server-controlled at the DB (baseline_schema.sql:1420-1432, 7126) with column-scoped UPDATE grants (11291-11303)
- Invitation flow is genuinely well-engineered: gen_random_uuid tokens with a UNIQUE constraint and 14-day expiry (baseline_schema.sql:4205-4217), and accept_invitation enforces pending status, expiry, invited-email binding, and plan seat limits inside a SECURITY DEFINER RPC (baseline_schema.sql:26-77); the client additionally clamps grantable roles (src/lib/org/onboardingInvites.ts:55-58) matching the org_invites_insert RLS policy (9317)
- Clean client secret hygiene: a single validated env module documents that only public config ships in the bundle (src/lib/env.ts), .env.example draws the secret boundary explicitly, and grepping src/ and public/ finds no service_role key, sk_live/sk_test, or provider secrets; the anon key is the new sb_publishable_ format
- Admin surfaces are enforced at the DB, not just the UI: feature_flags writes require user_is_system_admin() via RLS (baseline_schema.sql:9231-9239) and user_projects membership writes require system-admin or project-admin (8811-8819); AdminRoute/useAppSecurity gates are correctly documented as cosmetic
- Session handling basics are solid: persistSession + autoRefreshToken + detectSessionInUrl (src/lib/supabase.ts:13-17), a refresh-before-giving-up fallback in the auth listener (src/lib/AuthContext.tsx:96-112), cross-tab state sync via onAuthStateChange, correct autocomplete=new-password/current-password hints on the login form (src/pages/Landing.jsx:847), and a login error mapped to a non-enumerating 'Invalid email or password' (AuthContext.tsx:157-158)
- Security headers already deployed: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and a complete drafted CSP (currently Report-Only) with Sentry reporting (vercel.json:14-23)
- Sentry configured privacy-safe: sendDefaultPii:false and masked session replay (src/instrument.js:35-36)
- Anonymous surfaces are bounded: get_invitation exposes only invite-scoped fields keyed by an unguessable UUID (baseline_schema.sql:772-783), and demo_requests uses column-scoped anon INSERT with length checks and admin-only SELECT (supabase/migrations/20260623032908_demo_requests.sql)


#### 🟠 H22 · No password reset or change-password flow — users cannot recover or rotate credentials
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `src/pages/Landing.jsx:847`
- **Issue:** There is no call to supabase.auth.resetPasswordForEmail or updateUser({password}) anywhere in src/. The Landing sign-in form (src/pages/Landing.jsx:838-847) has no 'Forgot password?' link, Settings/Security pages offer no change-password control (src/pages/Security.jsx is a static info page), and the only auth.updateUser call is metadata-only (src/api/supabaseClient.ts:1025). A user who forgets their password is permanently locked out unless the operator manually resets them in the Supabase dashboard; a user who suspects compromise cannot rotate their password at all.
- **Impact:** Cannot-self-recover lockouts become operator support tickets for every forgotten password; enterprise security reviews fail immediately on 'no credential rotation'; a compromised password cannot be changed by the victim.
- **Fix:** Add a 'Forgot password?' link on Landing that calls supabase.auth.resetPasswordForEmail with a redirect to a new public /reset-password page handling the PASSWORD_RECOVERY event, plus a change-password form (updateUser({password})) in Settings. Verify the reset email template and redirect URL allowlist in the Supabase dashboard.

```
// Landing.jsx — under the password input
<button type="button" onClick={async () => {
  if (!email.trim()) { setSignupError("Enter your email first."); return; }
  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  setSignupNotice("If that email has an account, a reset link is on its way.");
}}>Forgot password?</button>

// New src/pages/ResetPassword.jsx (register in App.jsx PUBLIC_PAGES)
useEffect(() => {
  const { data: sub } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
  });
  return () => sub.subscription.unsubscribe();
}, []);
const save = async () => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (!error) navigate("/");
};
```

#### 🟠 H23 · No MFA — no enrollment UI, no verification step, no enforcement
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `src/lib/AuthContext.tsx:143`
- **Issue:** The only authentication factor is email+password (supabase.auth.signInWithPassword at src/lib/AuthContext.tsx:143). Grep finds zero usage of supabase.auth.mfa.* (enroll/challenge/verify/getAuthenticatorAssuranceLevel) anywhere in src/. Supabase supports TOTP MFA on the current plan, but without client enrollment/challenge code the capability is unreachable, and there is no org-level 'require MFA' policy.
- **Impact:** A phished or reused password is full account takeover including org-owner accounts that control billing, member roles, and all project/financial data. MFA is a hard checkbox on virtually every enterprise security questionnaire (SOC 2 CC6.1, cyber-insurance).
- **Fix:** Add a TOTP enrollment card in Settings (enroll → QR → challengeAndVerify), gate login completion on AAL when a factor exists, and later add an org setting to require MFA for owner/admin roles. Enable MFA in the Supabase dashboard (Auth → MFA).

```
// Settings → Security: enroll
const { data: enr } = await supabase.auth.mfa.enroll({ factorType: "totp" });
// render enr.totp.qr_code, then:
await supabase.auth.mfa.challengeAndVerify({ factorId: enr.id, code });

// After signInWithPassword succeeds (AuthContext.loginWithPassword):
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
  // route to an MFA code screen; call mfa.challengeAndVerify before
  // treating the user as authenticated
  return { success: false, error: { type: "mfa_required", message: "Enter your code" } };
}
```

#### 🟡 M38 · Logout does not clear the React Query cache — prior user's tenant data survives a user switch
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `src/lib/AuthContext.tsx:201`
- **Issue:** logout() only calls supabase.auth.signOut() and resets two state flags (src/lib/AuthContext.tsx:201-205); the api-layer logout is identical (src/api/supabaseClient.ts:990-992). Nothing calls queryClientInstance.clear()/removeQueries on sign-out or on a SIGNED_IN event for a different user id. React Query's default gcTime keeps all fetched tenant data (projects, financials, drawings) in memory, and non-user-scoped keys like ["projects"] (src/lib/query-client.ts:35) will serve the previous user's cached rows instantly to the next user who logs in on the same tab.
- **Impact:** On a shared workstation (jobsite trailer PCs are the norm for this user base), User B logging in after User A sees A's project list and page data render from cache for up to the refetch window — cross-tenant data disclosure without any RLS violation. Also weakens 'logout removes access to data' claims in security reviews.
- **Fix:** Clear the query cache on logout and whenever the authenticated user id changes; also clear residual client-side stores (field outbox key).

```
// src/lib/AuthContext.tsx
import { queryClientInstance } from "@/lib/query-client";

const logout = async () => {
  await supabase.auth.signOut();
  queryClientInstance.clear();               // drop all tenant data
  try { localStorage.removeItem("sbp:field:outbox:v1"); } catch { /* ignore */ }
  setUser(null);
  setIsAuthenticated(false);
};

// in the onAuthStateChange handler:
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") queryClientInstance.clear();
  if (event === "SIGNED_IN" && session?.user?.id !== lastUserIdRef.current) {
    queryClientInstance.clear();
    lastUserIdRef.current = session?.user?.id ?? null;
  }
  handleSession(session);
});
```

#### 🟡 M39 · Field offline outbox and photo blobs persist across logout and are not user-scoped
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `src/lib/field/offlineQueue.js:28`
- **Issue:** The Field Today offline outbox writes queued ops to the fixed localStorage key "sbp:field:outbox:v1" (src/lib/field/offlineQueue.js:28) and photo blobs to IndexedDB (src/lib/field/blobStore.js). The key contains no user id, and logout (src/lib/AuthContext.tsx:201-205) does not purge either store. Queued ops created by User A therefore survive sign-out; when User B signs in on the same device and reconnects, the flush replays A's ops under B's session (created_by/audit attribution to the wrong user, or RLS rejection and silent data loss of A's captures), and A's photos remain readable on the device.
- **Impact:** Wrong-user attribution on audit-logged field records, potential loss of offline captures on shared field tablets, and residual project photos/data on a device after the user who captured them logged out.
- **Fix:** Namespace the outbox and blob store by user id (include auth.uid in STORAGE_KEY / DB name), refuse to flush ops whose stored user id doesn't match the current session, and purge both stores in logout().

```
// offlineQueue.js — per-user key
const keyFor = (userId) => `sbp:field:outbox:v1:${userId || "anon"}`;

// stamp ops at enqueue time
export function makeProgressOp(taskId, progress, userId, now = Date.now()) {
  return { type: OP_SCHEDULE_PROGRESS, taskId, progress, userId, queuedAt: now };
}

// at flush time (FieldToday):
const { data: { user } } = await supabase.auth.getUser();
const queue = loadQueue(storageFor(user.id)).filter(op => op.userId === user.id);

// AuthContext.logout(): purge
try {
  Object.keys(localStorage)
    .filter(k => k.startsWith("sbp:field:outbox:"))
    .forEach(k => localStorage.removeItem(k));
  indexedDB.deleteDatabase("sbp-field-blobs"); // match blobStore's DB name
} catch { /* ignore */ }
```

#### 🟡 M40 · Auth tokens in localStorage with CSP still Report-Only — full XSS blast radius
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `vercel.json:22`
- **Issue:** The Supabase client uses the default localStorage session storage (src/lib/supabase.ts:13-17, persistSession:true with no custom storage), so access AND refresh tokens are readable by any script that achieves XSS. The compensating control — the Content-Security-Policy in vercel.json — is deployed only as Content-Security-Policy-Report-Only (vercel.json:22), which blocks nothing. This is the standard Supabase SPA pattern (cookie sessions would require a backend), so CSP enforcement is the practical mitigation, and it has been drafted but never turned on.
- **Impact:** A single successful XSS (e.g. via a malicious uploaded filename or markdown field rendered unsafely) exfiltrates long-lived refresh tokens for any user including org owners; Report-Only CSP provides zero runtime protection against injected scripts.
- **Fix:** Review the Sentry CSP reports accumulated since the header shipped, fix any legitimate violations, then flip the header key from Content-Security-Policy-Report-Only to Content-Security-Policy (optionally keeping the Report-Only variant for a canary period). Keep script-src free of unsafe-inline.

```
// vercel.json — enforce (keep the same policy string)
{
  "key": "Content-Security-Policy",
  "value": "default-src 'self'; script-src 'self' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.us.sentry.io https://*.ingest.sentry.io https://api.stripe.com; worker-src 'self' blob:; frame-src 'self' https://js.stripe.com https://checkout.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}
```

#### 🟡 M41 · user_profiles INSERT is not column-scoped and the profile-creation trigger is missing from migrations — latent role self-escalation path
- **Severity:** medium · **Effort:** S · CONFIRMED
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:11286`
- **Issue:** authenticated has a full-table INSERT grant on user_profiles (supabase/migrations/20260101000010_baseline_schema.sql:11286) and the profiles_insert_own policy only checks id = auth.uid() (line 9450) — it does not constrain the role column. The prevent_user_profile_role_change trigger fires only BEFORE UPDATE OF role (line 7126), not on INSERT. Today this is blocked solely by the PK conflict with the row handle_new_user creates at signup — but that function's CREATE TRIGGER ... ON auth.users statement is NOT in the repo's migrations (only the function body at line 866; pg_dump omits auth-schema triggers, and the 2026-06-20 re-baseline lost it). UNCONFIRMED: whether the trigger exists in the live database (likely yes, since signup works); it is definitively absent from the migration history, so any environment rebuilt from migrations has no auto-profile creation — and there, any new user could INSERT their own user_profiles row with role='admin', which grants global admin via user_is_system_admin() (line 2119).
- **Impact:** In any migration-built environment (staging, disaster recovery, future region), a self-serve signup can escalate to system admin — cross-tenant read of all projects (project_select policy, line 10012), feature-flag control, and membership management. In prod it is one deleted/missing profile row away from the same.
- **Fix:** Column-scope the INSERT grant to exclude role, extend the guard trigger to INSERT, and commit the auth.users trigger to a migration so rebuilt environments match prod.

```
-- new migration
REVOKE INSERT ON public.user_profiles FROM authenticated;
GRANT INSERT (id, email, full_name, avatar_url, metadata)
  ON public.user_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_user_profile_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND COALESCE(auth.role(),'') <> 'service_role' THEN
    IF TG_OP = 'INSERT' AND NEW.role IS DISTINCT FROM 'user' THEN
      RAISE EXCEPTION 'user_profiles.role is server-controlled';
    ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'user_profiles.role is server-controlled';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS prevent_user_profile_role_change ON public.user_profiles;
CREATE TRIGGER prevent_user_profile_role_change
  BEFORE INSERT OR UPDATE OF role ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_user_profile_role_change();

-- make rebuilt envs match prod (verify name against live DB first)
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

#### 🟡 M42 · Critical auth hardening lives in unverifiable Supabase dashboard settings — needs a manual audit pass
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `src/pages/Landing.jsx:247`
- **Issue:** UNCONFIRMED: the following cannot be read from the repo and must be verified in the Supabase dashboard (Auth → Settings/Providers/Rate limits): (1) minimum password length + character requirements — the app enforces only an 8-char client check on signup (src/pages/Landing.jsx:247) and nothing on the login path, so the server policy is the real gate; (2) leaked-password (HaveIBeenPwned) protection — off by default; (3) 'Confirm email' — the client handles both on and off (src/lib/AuthContext.tsx:179-188), so if it were off, unverified emails get instant sessions; (4) auth endpoint rate limits / anti-bot (no CAPTCHA is wired in the client, so protection is whatever GoTrue's per-IP defaults are — there is no account lockout); (5) refresh-token rotation/reuse-interval and session time-box settings.
- **Impact:** If any of these are at permissive defaults, the platform accepts weak/breached 8-character passwords, unverified signup emails, and unthrottled credential-stuffing — all standard findings in an enterprise pentest.
- **Fix:** Dashboard pass: set min password length ≥ 10 with complexity, enable leaked-password protection, confirm 'Confirm email' is ON, review Auth rate limits, and enable CAPTCHA (Turnstile) on signup/login if bot pressure appears. Record the chosen values in ARCHITECTURE.md so they are auditable.

```
// Optional client mirror once dashboard policy is set (Landing.jsx):
if (password.length < 10) {
  setSignupError("Use at least 10 characters for your password.");
  return;
}
```

#### 🟡 M43 · No SSO (SAML/OIDC), no SCIM — enterprise identity integration absent
- **Severity:** medium · **Effort:** L · **Manual step** · CONFIRMED
- **Location:** `src/lib/AuthContext.tsx:143`
- **Issue:** Authentication is exclusively email+password: the only sign-in call is supabase.auth.signInWithPassword (src/lib/AuthContext.tsx:143); grep finds no signInWithOAuth, signInWithSSO, SAML, or OIDC usage anywhere in src/, and there is no provisioning/deprovisioning API (SCIM). Offboarding an employee requires manually removing them from each org/project; their password credential remains valid until manually handled.
- **Impact:** Mid-size steel fabricators and GCs with Azure AD/Entra or Google Workspace will require IdP-backed login for procurement approval; lack of centralized deprovisioning is an offboarding risk auditors flag (terminated employee retains access until someone remembers to remove them).
- **Fix:** Roadmap item: Supabase Auth supports SAML 2.0 SSO on the Pro plan — add supabase.auth.signInWithSSO({domain}) behind a 'Sign in with SSO' button, with per-org IdP config; start with Google/Microsoft OAuth (signInWithOAuth) as a low-effort stepping stone. SCIM can be deferred but document manual offboarding steps until then.

```
// Landing.jsx — SSO stepping stone (Supabase Pro, after dashboard IdP setup)
const ssoLogin = async () => {
  const domain = email.split("@")[1];
  const { data, error } = await supabase.auth.signInWithSSO({ domain });
  if (data?.url) window.location.href = data.url; // IdP redirect
};
// Or immediate OAuth option:
await supabase.auth.signInWithOAuth({ provider: "azure",
  options: { scopes: "email", redirectTo: window.location.origin } });
```

#### ⚪ L38 · Invitations are never emailed — admins hand-copy tokenized links
- **Severity:** low · **Effort:** M · CONFIRMED
- **Location:** `src/pages/OrgMembers.jsx:146`
- **Issue:** Creating an invite only inserts a row; delivery is manual: OrgMembers copies the tokenized accept link to the clipboard and tells the admin to paste it to the invitee ('link copied, send it to them', src/pages/OrgMembers.jsx:146,167-168; link built at src/lib/org/repository.ts:146-149). The batch onboarding hand-off likewise ends at 'copy links from Pending invites below'. No system email is sent even though an email-send Edge Function pipeline exists (supabase/functions/email-send).
- **Impact:** Onboarding a 15-person team means manually copying and sending 15 links through whatever channel the admin picks (SMS, personal email), which is error-prone, leaks bearer tokens into uncontrolled channels, and looks unfinished in an enterprise eval; invites silently expire after 14 days with no reminder.
- **Fix:** Send the invite link by email at creation time — either via the existing email-send Edge Function or Supabase's inviteUserByEmail admin API from a small server-side function — keeping copy-link as a fallback. Add an expiry-reminder or one-click re-send on the Pending list.

```
// after createInvitation(...) in OrgMembers sendInvite/batch flow:
await supabase.functions.invoke("email-send", {
  body: {
    to: inv.email,
    subject: `You're invited to ${currentOrg.name} on SteelBuild Pro`,
    text: `${inviterName} invited you to the ${currentOrg.name} workspace.\n` +
          `Accept (expires ${new Date(inv.expires_at).toLocaleDateString()}):\n` +
          `${inviteLink(inv.token)}`,
  },
});
```

#### ⚪ L39 · feature_flags SELECT USING(true) exposes per-user override emails to every authenticated user across all tenants
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:9243`
- **Issue:** The feature_flags_select policy is FOR SELECT TO authenticated USING (true) (supabase/migrations/20260101000010_baseline_schema.sql:9243), and rows carry user_overrides — a JSON map keyed by user email (consumed in src/hooks/useFeatureFlag.ts:42-62). Any authenticated user in any org can read the full flag list including every override email address from other tenants, plus unreleased feature keys/descriptions.
- **Impact:** Cross-tenant PII disclosure (email addresses) and leakage of rollout/experiment metadata; small blast radius today but it is a textbook multi-tenant isolation exception an auditor will flag.
- **Fix:** Replace the direct table read with a definer RPC that returns only the caller-resolved (flag_key, enabled) pairs; keep full-row SELECT admin-only.

```
-- migration
CREATE OR REPLACE FUNCTION public.my_feature_flags()
RETURNS TABLE(flag_key text, enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.flag_key,
         COALESCE(
           (f.user_overrides ->> lower(coalesce(auth.email(), '')))::boolean,
           coalesce(f.enabled, false))
  FROM public.feature_flags f;
$$;
GRANT EXECUTE ON FUNCTION public.my_feature_flags() TO authenticated;

DROP POLICY "feature_flags_select" ON public.feature_flags;
CREATE POLICY "feature_flags_select" ON public.feature_flags
  FOR SELECT TO authenticated USING (public.user_is_system_admin());

-- client: useFeatureFlag.ts queryFn → supabase.rpc("my_feature_flags")
```

#### ⚪ L40 · Pending invite bearer tokens readable by every org member, not just admins
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `supabase/migrations/20260101000010_baseline_schema.sql:9321`
- **Issue:** org_invites_select is USING (user_is_org_member(org_id)) (supabase/migrations/20260101000010_baseline_schema.sql:9321) and the client selects * including token (src/lib/org/repository.ts:108-115). Any plain 'member' can enumerate all pending invites with their bearer tokens and invited roles. Email-binding in accept_invitation means a member cannot accept someone else's invite, but tokens are secrets and only admins need them (the Team page invite UI is an admin function).
- **Impact:** Unnecessary secret exposure: a curious member sees who is being invited at what role, and a member whose own session is compromised leaks other invitees' tokens; combined with any future weakening of the email check this becomes org takeover material.
- **Fix:** Restrict invite SELECT to org admins (matching the insert/update/delete policies).

```
-- migration
DROP POLICY "org_invites_select" ON public.organization_invitations;
CREATE POLICY "org_invites_select" ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (public.user_org_role_at_least(org_id, 'admin'::text));
```

#### ⚪ L41 · No anti-automation on anonymous surfaces (get_invitation RPC, demo_requests insert, signup)
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `supabase/migrations/20260623032908_demo_requests.sql:23`
- **Issue:** get_invitation is EXECUTE-granted to anon (supabase/migrations/20260101000010_baseline_schema.sql:10508) and demo_requests accepts anon INSERTs (20260623032908_demo_requests.sql:23-33); neither has any rate limiting beyond Supabase's platform defaults, and the signup form has no CAPTCHA. Invitation-token guessing is impractical (UUIDv4 space), so the realistic abuse is volumetric: demo_requests spam filling the admin triage table, and scripted signups consuming auth email quota and polluting the tenant list.
- **Impact:** Spam/flood abuse and email-quota exhaustion rather than data compromise; a noisy but real operational nuisance once the product is marketed.
- **Fix:** Enable Supabase Auth rate limits review + attach Vercel WAF/challenge rules to /rest/v1/rpc/get_invitation and the demo-request path; add Turnstile CAPTCHA to the demo-request and signup forms (Supabase Auth has native CAPTCHA support).

```
// Supabase dashboard: Auth → Bot and Abuse Protection → enable Turnstile.
// Client (Landing.jsx):
const { data, error } = await supabase.auth.signUp({
  email, password,
  options: { captchaToken },   // from the Turnstile widget
});
```

#### ⚪ L42 · No session lifetime controls: no idle timeout, no absolute session cap, no session management UI
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `src/lib/supabase.ts:13`
- **Issue:** Sessions are indefinite: persistSession + autoRefreshToken (src/lib/supabase.ts:13-17) with an extra refresh-on-expiry fallback (src/lib/AuthContext.tsx:96-108) means a browser that keeps its refresh token stays signed in forever. There is no client idle-timeout, no 'sign out other sessions' control (no supabase.auth.signOut({scope:'global'}) usage), and no user-visible active-session list. UNCONFIRMED: whether the Supabase Pro 'time-box user sessions' / inactivity-timeout settings are configured in the dashboard.
- **Impact:** A logged-in browser on an unattended shared jobsite computer grants indefinite access to project and financial data; enterprise policies commonly require configurable idle timeout and remote session revocation.
- **Fix:** Set session time-box + inactivity timeout in the Supabase dashboard (Auth → Sessions, Pro feature); add a 'Sign out everywhere' button (signOut({scope:'global'})) in Settings; optionally add a client idle timer for kiosk/shared-device deployments.

```
// Settings → Security
<button onClick={async () => {
  await supabase.auth.signOut({ scope: "global" }); // revokes ALL refresh tokens
}}>Sign out of all devices</button>
```

#### ⚪ L43 · Dead ProtectedRoute component and auth.redirectToLogin target an unregistered /login route
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/components/shared/ProtectedRoute.jsx:47`
- **Issue:** src/components/shared/ProtectedRoute.jsx navigates unauthenticated users to "/login" (line 47) but the component has no importers (grep: only its own file), and auth.redirectToLogin (src/api/supabaseClient.ts:998-1001) also hard-navigates to /login — a path registered nowhere (App.jsx PUBLIC_PAGES has only /privacy, /terms, /security; routes.js comment at src/config/routes.js:231 lists the static mounts). It only 'works' because any unknown path falls through to AuthenticatedApp, which renders Landing when signed out.
- **Impact:** Confusing auth surface for future contributors — two plausible-looking auth guards that don't participate in the real gate; if someone wires ProtectedRoute or redirectToLogin into a flow expecting a real login route with ?redirect= handling, the redirect param is silently ignored (no code reads it).
- **Fix:** Delete ProtectedRoute.jsx (dead code) and either remove auth.redirectToLogin or point it at "/" with a comment that Landing is the login surface; alternatively implement post-login redirect handling if deep-link restoration is wanted.

```
// src/api/supabaseClient.ts
redirectToLogin: (): void => {
  // Landing (mounted at every path when signed out) IS the login surface.
  window.location.href = "/";
},
// and: git rm src/components/shared/ProtectedRoute.jsx
```

#### ⚪ L44 · No email-change flow — users cannot update their sign-in email
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `src/api/supabaseClient.ts:1016`
- **Issue:** The metadata updater deliberately blocks the email key (BLOCKED_FIELDS, src/api/supabaseClient.ts:1016-1020) — correct, since email changes must go through verified supabase.auth.updateUser({email}) — but no code anywhere calls that path, and Settings offers no change-email control. A user whose company email changes (rebrand, domain migration — common in construction M&A) must get a brand-new account, losing their user id linkage to created_by/audit attribution and org/project memberships.
- **Impact:** Account continuity gap: email changes force re-invites and orphan historical attribution; support burden lands on the operator.
- **Fix:** Add a change-email form in Settings using supabase.auth.updateUser({ email }) (Supabase sends confirmation links to both addresses when 'Secure email change' is enabled — verify that dashboard setting).

```
// Settings → Account
const changeEmail = async (newEmail) => {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (!error) toast.success(
    "Check both your old and new inbox to confirm the change.");
};
```

### Reliability & DR

The deploy pipeline is genuinely strong (CI-gated sole-path production deploys, sane React Query retry policy, break-glass LLM controls, a rebuilt bootstrap-from-zero migration baseline with a written runbook), and graceful-degradation primitives exist (error boundaries, regex email-classify fallback, fail-open auth boot). However, the backup/DR story is the weakest enterprise domain: nothing in docs/ or ARCHITECTURE.md documents PITR, restore testing, or RTO/RPO targets; the Storage bucket holding drawing PDFs — the product's crown jewels — has no replication or export path at all; and the tenant-facing "workspace backup" (project-export) silently truncates at the PostgREST row cap and covers only 15 of ~100 project tables. Operational readiness is also thin: no incident-response runbook, no uptime monitoring or alert routing, the post-deploy E2E smoke is opt-in and not yet enabled, and edge functions deploy out-of-band from CI with documented repo/production drift. Several smaller reliability gaps (offline outbox wedge/silent-drop, single-provider LLM routing, realtime reconnect staleness) are real but bounded. None of these are code-crash risks today; they are the gaps a first serious incident or enterprise procurement review would expose immediately.

**Strengths:**
- Production deploys are CI-gated and single-path: vercel.json sets git.deploymentEnabled.main=false and .github/workflows/ci.yml runs lint + 4 typecheck gates + full Vitest + build before the deploy job — a red push cannot reach steelbuild-pro.com.
- React Query defaults are retry-storm-safe (src/lib/query-client.ts): 1 retry max for queries, no retry on 400/404, mutations never auto-retried, 30s staleTime.
- llm-proxy has real blast-radius controls: LLM_KILL_SWITCH break-glass, per-user rolling-24h quota with fail-CLOSED for expensive document/image use-cases, a 2s bounded quota read so a stalled usage check cannot hang requests, and a priced-model allowlist (supabase/functions/llm-proxy/index.ts, quota.ts).
- Deterministic fallbacks exist for key AI paths: email-ingest falls back to a free regex classifier (supabase/functions/email-ingest/index.ts:385) and revision compare retains a deterministic visual overlay.
- The offline field outbox is deliberately narrow and idempotent: coalesced last-value-wins progress ops, client_op_id dedup against a partial-unique index with unique-violation-treated-as-success, FIFO fail-stop flush, all pure and unit-tested (src/lib/field/offlineQueue.js).
- project-export is fail-safe in posture: RLS-scoped reads, aborts on any per-table failure rather than shipping a silently partial dump, and aborts if the service-role audit row cannot be written (supabase/functions/project-export/index.ts:227-260).
- Migration history was re-baselined (3 files) and verified to bootstrap a DB from zero, with a written cutover runbook (docs/db-baseline-cutover.md) — a genuine DR asset for schema recovery.
- Sentry is production-tuned: masked session replay, sendDefaultPii off, 10%/100% sampling, environment/release wiring, dual error boundaries reporting render crashes (src/instrument.js).
- A documented reliability-testing harness gates CI on the flows customers touch first: import flows, the multi-tenant boot gate (with a tested fail-open rule so an org-fetch error never traps a paying user), and billing entitlements (docs/RELIABILITY_TESTING.md).
- The client is truncation-aware for reads: LIST_ROW_CAP=2000 explicit default, dev-mode truncation warnings, and a shared ListTruncationNotice so silent 1000-row failures surface (src/api/supabaseClient.ts:347-367).


#### 🟠 H24 · No documented backup/DR posture: PITR unverified, no restore test, no RTO/RPO targets anywhere
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `docs/db-baseline-cutover.md:1`
- **Issue:** UNCONFIRMED (dashboard state not visible from repo): grep of docs/ and ARCHITECTURE.md for backup/PITR/restore/RTO/RPO/disaster finds zero backup or DR documentation. docs/ contains a migration-cutover runbook (docs/db-baseline-cutover.md) but no backup policy, no PITR confirmation, no evidence a restore has ever been rehearsed, and no recovery-time/recovery-point objectives. Supabase Pro includes daily backups (24h RPO); PITR is a paid add-on that may or may not be enabled.
- **Impact:** Without PITR, a bad migration, agent error, or malicious action at 4pm loses up to a full day of multi-tenant project data (RFIs, submittals, pay apps). Without a rehearsed restore, actual recovery time during an incident is unknown. Enterprise buyers ask for RTO/RPO in every security questionnaire; today there is no answer.
- **Fix:** (1) In the Supabase dashboard confirm daily backups are healthy and enable PITR on the production project; (2) run one full restore rehearsal to a disposable project and time it; (3) commit docs/runbooks/backup-dr.md recording: what is backed up (DB yes / Storage NO — see separate finding), PITR window, RTO/RPO targets, restore procedure step-by-step, and the rehearsal date/result. Re-rehearse quarterly.

```
# docs/runbooks/backup-dr.md (skeleton)
## What is backed up
- Postgres: Supabase daily backups (RPO 24h) + PITR (RPO ~2min) — enabled YYYY-MM-DD
- Storage (app-files, email-attachments): NOT covered by DB backups — see bucket replication runbook
## Targets
- RPO: 15 min (DB via PITR) / 24 h (Storage via nightly sync)
- RTO: 4 h (last rehearsed: YYYY-MM-DD, actual: Xh Ym)
## Restore procedure
1. Supabase dashboard -> Database -> Backups -> Restore / PITR to timestamp
2. Re-point VITE_SUPABASE_URL only if restoring to a NEW project (also redeploy edge functions + secrets)
3. Verify: login, project list, drawing register, one signed-URL file open
## Rehearsal log
| date | scenario | RTO actual | notes |
```

#### 🟠 H25 · Drawing PDFs (Storage buckets) have zero backup/replication — DB backups do not cover them
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/project-export/index.ts:40`
- **Issue:** ARCHITECTURE.md:361-369 documents the app-files bucket (drawing PDFs, photos, gzipped IFC models) and email-attachments, but no backup/replication mechanism exists anywhere in the repo, and Supabase database backups/PITR do NOT include Storage objects. The tenant-facing project-export explicitly exports only DB rows (PROJECT_EXPORT_TABLES, supabase/functions/project-export/index.ts:40-56) — no file content, not even a file manifest. uploaded_files/drawings rows would survive a DB restore but point at objects that no longer exist if the bucket is damaged.
- **Impact:** Accidental bucket deletion, a bad cleanup script, a compromised service key, or a Supabase storage incident permanently destroys every tenant's contract drawings — the crown-jewel artifacts the product exists to manage. This is the single largest unhedged data-loss exposure in the system (the org already had one storage-related prod incident: the free-tier cap lockout).
- **Fix:** Stand up an out-of-band bucket sync: a scheduled GitHub Action (or small VM cron) running rclone from Supabase Storage S3-compatible endpoint to an independent bucket (S3/R2/B2) nightly, with versioning enabled on the destination so deletes are recoverable. Additionally add a file manifest (uploaded_files + storage paths + sizes + hashes) to project-export so tenants can verify completeness.

```
# .github/workflows/storage-backup.yml
name: storage-backup
on:
  schedule: [{ cron: "0 8 * * *" }]
  workflow_dispatch: {}
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Install rclone
        run: curl https://rclone.org/install.sh | sudo bash
      - name: Sync app-files -> offsite bucket
        env:
          # Supabase Storage exposes an S3-compatible endpoint (project settings -> Storage -> S3)
          RCLONE_CONFIG_SRC_TYPE: s3
          RCLONE_CONFIG_SRC_ENDPOINT: https://kjrwqagyeswwoxpjkcko.storage.supabase.co/storage/v1/s3
          RCLONE_CONFIG_SRC_ACCESS_KEY_ID: ${{ secrets.SUPABASE_S3_ACCESS_KEY }}
          RCLONE_CONFIG_SRC_SECRET_ACCESS_KEY: ${{ secrets.SUPABASE_S3_SECRET_KEY }}
          RCLONE_CONFIG_DST_TYPE: s3
          RCLONE_CONFIG_DST_PROVIDER: Cloudflare
          RCLONE_CONFIG_DST_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
          RCLONE_CONFIG_DST_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY }}
          RCLONE_CONFIG_DST_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_KEY }}
        run: |
          rclone sync SRC:app-files DST:sbp-backup-app-files --fast-list --transfers 8 --checksum
          rclone sync SRC:email-attachments DST:sbp-backup-email-attachments --fast-list
# Enable object versioning / soft-delete retention on the destination bucket (dashboard).
```

#### 🟠 H26 · project-export 'workspace backup' silently truncates at the PostgREST row cap (~1000 rows/table)
- **Severity:** high · **Effort:** S · CONFIRMED
- **Location:** `supabase/functions/project-export/index.ts:231`
- **Issue:** supabase/functions/project-export/index.ts:231 fetches each table with a single unpaginated `.select("*").eq("project_id", ...)`. The repo's own client documents that PostgREST enforces a server-side max-rows ceiling of ≈1000 (src/api/supabaseClient.ts:347-352). Any project table exceeding the cap (drawings, activities-adjacent tables, schedule_tasks on a big job) is silently cut off; the envelope's row_counts then report the truncated count as the total, and the audit row records it as a complete export. This directly contradicts the function's own stated invariant at lines 227-228: 'a partial backup that silently drops a table is worse than none.'
- **Impact:** A tenant with 3,000 drawing rows downloads a 'backup' missing 2,000 of them with zero warning. If that export is ever used for data portability, offboarding, or recovery, the loss is discovered only when it is too late. UNCONFIRMED: the exact live max-rows value (Supabase default is 1000) cannot be read from the repo, but the client comment asserts it.
- **Fix:** Paginate each table read with .range() until a short page is returned, and include the page size used in the envelope so completeness is verifiable.

```
const PAGE = 1000;
async function fetchAllRows(rls: SupabaseClient, table: string, projectId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await rls
      .from(table)
      .select("*")
      .eq("project_id", projectId)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
// in handle():
for (const table of PROJECT_EXPORT_TABLES) {
  try {
    tableResults.push({ table, rows: await fetchAllRows(rls, table, projectId) });
  } catch (e) {
    console.error(`[project-export] ${e}`);
    return errorResponse(500, `Failed to read ${table}`);
  }
}
```

#### 🟠 H27 · No incident-response runbook, no uptime monitoring, no alert routing, no rollback procedure
- **Severity:** high · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `docs/RELIABILITY_TESTING.md:1`
- **Issue:** docs/ contains a tutorial, audits, Power Automate setup, Stripe go-live, and a migration runbook — but no incident-response/on-call/escalation document, no documented production rollback procedure (Vercel instant-rollback exists as a platform feature but is written down nowhere), no synthetic uptime probe for steelbuild-pro.com or the edge functions, and no documented Sentry alert rules (errors are captured but nothing states who is paged, how, or when). The known dependency failure domains (Supabase, Vercel, OpenAI, Stripe, Power Automate) have no per-dependency playbook.
- **Impact:** For a paid multi-tenant SaaS, outage detection currently depends on a customer emailing the owner. First-incident response time is unbounded, and an enterprise buyer's vendor-risk review will ask for exactly these artifacts (incident process, escalation, status communication) on day one.
- **Fix:** Commit docs/runbooks/incident-response.md (detection -> triage -> mitigation -> comms -> postmortem, plus per-dependency playbooks: Supabase down, OpenAI down, Stripe webhook backlog, Vercel rollback via dashboard 'Instant Rollback' or `vercel rollback`), configure Sentry alert rules (new-issue + error-rate spike -> email/phone), and add a free-tier synthetic probe (UptimeRobot/Checkly) on https://steelbuild-pro.com and one edge-function OPTIONS endpoint.

```
# docs/runbooks/incident-response.md (skeleton)
## Detection
- UptimeRobot: https://steelbuild-pro.com (60s) + llm-proxy OPTIONS probe
- Sentry alerts: new issue / >50 events/hr -> nickl@shsteelaz.com + SMS
## Severity
- SEV1 app down or cross-tenant data exposure | SEV2 core workflow broken | SEV3 degraded
## Playbooks
- Vercel bad deploy: Dashboard -> Deployments -> previous good -> Instant Rollback (or `vercel rollback <url>`)
- Supabase outage: status.supabase.com; app read-fails gracefully; comms template below
- OpenAI outage: AI features degrade (deterministic overlay/regex remain); optional: flip router to anthropic
- Stripe: plan changes stall (org.plan anchor keeps entitlements); replay webhooks from Stripe dashboard
- Cost runaway: set LLM_KILL_SWITCH=1 on llm-proxy (takes effect ~30-60s, no redeploy)
## Comms
- Customer email template + status note in-app
## Postmortem
- Blameless writeup in docs/postmortems/YYYY-MM-DD.md within 5 business days
```

#### 🟡 M44 · All LLM use-cases route to a single provider (OpenAI) with no failover despite a second provider client existing
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/functions/llm-proxy/router.ts:27`
- **Issue:** Every row in ROUTING_TABLE targets provider 'openai' (supabase/functions/llm-proxy/router.ts:27-58). providers/anthropic.ts exists but nothing fails over to it — a routing decision is static and an OpenAI provider error is returned to the caller. Deterministic fallbacks exist only for email-classify (regex) and revision-compare's visual overlay.
- **Impact:** An OpenAI outage or account issue (the routing comments record this already happened once: 'Anthropic credit balance was exhausted' forced a manual switch) disables all AI features simultaneously — including Revision Intelligence, the product's stated key differentiator — until a human edits the router and redeploys the function.
- **Fix:** Add an optional fallback target per routing row and a one-retry-on-fallback in the dispatch path of llm-proxy/index.ts (guard: only when the fallback provider's API key is configured). Keep telemetry recording which provider actually served the call.

```
// router.ts
export interface RoutingTarget { provider: string; model: string; fallback?: { provider: string; model: string } }
// e.g.
"revision-compare": { provider: "openai", model: "gpt-4o-mini",
  fallback: { provider: "anthropic", model: "claude-3-5-haiku-latest" } },

// index.ts dispatch (sketch)
let target = getProviderForUseCase(useCase);
let result;
try {
  result = await callProvider(target, request);
} catch (primaryErr) {
  const fb = target.fallback;
  if (fb && providerConfigured(fb.provider)) {
    console.warn(`[llm-proxy] ${target.provider} failed (${primaryErr}); failing over to ${fb.provider}`);
    result = await callProvider(fb, request); // telemetry rows record fb.provider/fb.model
  } else {
    throw primaryErr;
  }
}
```

#### 🟡 M45 · Offline field outbox wedges permanently behind a non-retryable failed op
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `src/lib/field/offlineQueue.js:184`
- **Issue:** flushQueue is fail-stop: on the first handler error it returns with the failed op still at the head of `remaining` (src/lib/field/offlineQueue.js:184-186), and useFieldOutbox saves that queue back verbatim (src/hooks/useFieldOutbox.js:37-39). The module exports isLikelyOfflineError (offlineQueue.js:198-209) to distinguish offline from permanent server rejections, but the flush path never consults it. There is also no retry cap, no dead-letter, and no user-visible error — only a pending count.
- **Impact:** If a queued op fails permanently (RLS deny after the user's role changed, referenced schedule task deleted, validation reject), it fails on every flush forever and blocks every capture queued behind it. Those field captures (punch items, photos, progress) are never synced and the user only sees a stuck pending badge — silent field data loss.
- **Fix:** During flush, classify the error: if it is not offline-like, move the op to a dead-letter list (persisted alongside the queue) and continue with the next op; surface dead-lettered captures in Field Today with a retry/discard affordance.

```
// offlineQueue.js — inside flushQueue's catch
} catch (error) {
  if (isLikelyOfflineError(error)) {
    return { remaining, synced, deadLettered, failed: op, error }; // still offline: stop, keep order
  }
  // Permanent rejection: don't wedge the queue — dead-letter and continue.
  remaining.shift();
  deadLettered.push({ op, error: String(error?.message || error), at: Date.now() });
  continue;
}
// useFieldOutbox.js — after flush
if (result.deadLettered.length > 0) {
  saveDeadLetters([...loadDeadLetters(), ...result.deadLettered]);
  toast.error(`${result.deadLettered.length} field update(s) could not sync — review in Field Today`);
}
```

#### 🟡 M46 · Edge functions deploy out-of-band from CI; repo and production demonstrably drift
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:118`
- **Issue:** CI (.github/workflows/ci.yml) builds and ships only the frontend; every Supabase function is deployed manually via `npx supabase functions deploy` (documented in CLAUDE.md §16). The drift is already visible in-repo: ARCHITECTURE.md:355-359 lists stripe-setup/stripe-webhook/stripe-worker as deployed functions while CLAUDE.md:736 says they were deleted, and supabase/functions/ contains neither them nor the 'still deployed' deprecated sharepoint-proxy/bluebeam-proxy.
- **Impact:** During an incident, a responder cannot trust the repo to reflect what is actually running; a fix merged to main does not reach a function until someone remembers the manual deploy (and a _shared/ change requires redeploying every importer — easy to miss one). This is a classic source of 'fixed but still broken in prod' incidents; §32's fab-status cautionary tale is the same failure shape.
- **Fix:** Add a path-filtered CI job that deploys functions on merge to main using a SUPABASE_ACCESS_TOKEN secret, preserving each function's verify_jwt setting; at minimum add a nightly drift check comparing `supabase functions list` to the repo directory and failing loudly.

```
# ci.yml — after deploy job
  deploy-functions:
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      PROJECT_REF: kjrwqagyeswwoxpjkcko
    steps:
      - uses: actions/checkout@v4
      - name: Deploy edge functions (JWT flags must match each fn's contract)
        run: |
          npx supabase functions deploy llm-proxy      --project-ref $PROJECT_REF --no-verify-jwt
          npx supabase functions deploy email-ingest   --project-ref $PROJECT_REF --no-verify-jwt
          npx supabase functions deploy stripe-billing --project-ref $PROJECT_REF --no-verify-jwt
          npx supabase functions deploy email-send     --project-ref $PROJECT_REF
          npx supabase functions deploy project-export --project-ref $PROJECT_REF
          npx supabase functions deploy schedule-assistant --project-ref $PROJECT_REF
```

#### 🟡 M47 · Tenant-facing export covers only 15 of ~100 project-owned tables while labeled a 'backup'
- **Severity:** medium · **Effort:** M · CONFIRMED
- **Location:** `supabase/functions/project-export/index.ts:40`
- **Issue:** PROJECT_EXPORT_TABLES (supabase/functions/project-export/index.ts:40-56) exports 15 tables. The baseline schema (supabase/migrations/20260101000010_baseline_schema.sql) defines ~100 project tables; omitted from export are, among others: drawing_revisions (the authoritative revision register), drawing_markups (collaborative markup), drawing_revision_deltas (AI diff results), submittal_rounds is included but submittal_sheet_responses is not, pay_applications/pay_application_lines, backcharges/tm_tickets, piece_production, photos, comments, uploaded_files, fab_release_log, and activities (the audit trail). The Settings UI and code comments call this 'Real workspace backup' (src/components/settings/SystemTab.jsx:29).
- **Impact:** A tenant relying on the export for data portability or offboarding loses their revision history, markups, pay-app records, backcharge defense packages, and audit trail without knowing — a contractual/compliance problem in construction, where the audit trail is the defense artifact.
- **Fix:** Expand PROJECT_EXPORT_TABLES to all project-scoped tables (generate the list from the DB: tables with a project_id column) and keep it in lockstep with src/services/projectExportService.ts; until then, change the UI copy to enumerate exactly what is and is not included.

```
-- one-time generator for the canonical list (run read-only):
select c.relname
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and a.attname = 'project_id'
  and c.relkind = 'r'
order by 1;
-- paste the result into PROJECT_EXPORT_TABLES in BOTH
-- supabase/functions/project-export/index.ts and
-- src/services/projectExportService.ts (kept in lockstep per the file header).
```

#### 🟡 M48 · Post-deploy verification is opt-in and not enabled — deploys ship with zero runtime smoke
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `.github/workflows/ci.yml:177`
- **Issue:** The e2e-smoke job (.github/workflows/ci.yml:177-180) only runs when the E2E_ENABLED repo variable is 'true', and TECH_DEBT.md:88-89 + docs/RELIABILITY_TESTING.md:45-61 confirm no signed-in browser E2E exists yet (blocked on a seeded test user). The deploy job has no post-deploy health assertion of any kind.
- **Impact:** A runtime-only breakage that unit tests and the build cannot see — a missing Vercel env var, a CORS misconfiguration (this class already broke prod AI once, per the CORS memory), an RLS rejection — reaches every tenant and stays broken until a human stumbles on it. This is exactly the 'build-green but field-broken' failure §32 of the engineering contract warns about.
- **Fix:** Enable the unauthenticated boot smoke immediately (it needs no test user: page loads, Landing renders, no console errors), and add a cheap curl assertion to the deploy job as a stopgap. Then provision the seeded test user (separate test org) to unlock the authed smoke.

```
# ci.yml deploy job — add after 'Deploy prebuilt output':
      - name: Post-deploy smoke (HTTP + SPA shell)
        run: |
          set -e
          code=$(curl -s -o /tmp/body -w '%{http_code}' https://steelbuild-pro.com)
          test "$code" = "200"
          grep -q '<div id="root"' /tmp/body   # SPA shell served, not an error page
          # edge function reachable (OPTIONS preflight only proves routing, not logic)
          curl -s -o /dev/null -w '%{http_code}' -X OPTIONS \
            https://kjrwqagyeswwoxpjkcko.supabase.co/functions/v1/llm-proxy | grep -q 200
# and set the repo variable to turn on the Playwright boot smoke:
#   gh variable set E2E_ENABLED --body true -R lorteezy87/SteelBuild-Pro-Rev.2
```

#### 🟡 M49 · email-ingest depends on per-project Power Automate flows with no failure or freshness visibility
- **Severity:** medium · **Effort:** M · **Manual step** · CONFIRMED
- **Location:** `docs/email-ingest-power-automate.md:9`
- **Issue:** Inbound project email rides a per-project Power Automate cloud flow POSTing to the email-ingest webhook (docs/email-ingest-power-automate.md:9-27). Nothing monitors the pipeline end-to-end: if the flow's Office 365 connection expires, EMAIL_WEBHOOK_SECRET is rotated, the flow is disabled, or PA throttles, ingestion silently stops. The setup doc's troubleshooting covers initial wiring errors only — no retry policy guidance, no dead-letter, no 'last email received' heartbeat anywhere in the app.
- **Impact:** Project email (RFIs, submittal responses, transmittals) silently stops staging into the Email Inbox; in construction, a missed RFI response is a schedule/cost event. Discovery is by accident, potentially weeks later.
- **Fix:** Add a per-project freshness indicator computed from max(email_messages.received_at) on the Email Accounts screen with a stale warning (e.g. >3 business days with a connected mailbox), and document the PA-side retry policy (HTTP action: retry 4x exponential) + a monthly flow-health check in the setup doc. Optionally add a daily pg_cron check inserting an alert row when a previously-active mailbox goes quiet.

```
-- pg_cron freshness sentinel (sketch)
select cron.schedule('email-ingest-freshness', '0 14 * * 1-5', $$
  insert into alerts (project_id, type, severity, title, description)
  select s.project_id, 'email_ingest_stale', 'warning',
         'Inbound email may be broken',
         'No email ingested in 3+ business days for a connected mailbox.'
  from email_integration_settings s
  where s.enabled
    and not exists (
      select 1 from email_messages m
      where m.project_id = s.project_id
        and m.received_at > now() - interval '3 days')
    and not exists (
      select 1 from alerts a
      where a.project_id = s.project_id and a.type = 'email_ingest_stale'
        and a.created_at > now() - interval '3 days');
$$);
```

#### 🟡 M50 · LLM spend caps are disabled by default — likely no per-user cost/volume limit is live
- **Severity:** medium · **Effort:** S · **Manual step** · CONFIRMED
- **Location:** `supabase/functions/llm-proxy/quota.ts:17`
- **Issue:** UNCONFIRMED (env state not visible from repo): quota.ts documents 'Either dimension is DISABLED when its env var is unset or <= 0' (supabase/functions/llm-proxy/quota.ts:17-18), and CLAUDE.md §16 describes LLM_DAILY_COST_LIMIT_USD / LLM_DAILY_REQUEST_LIMIT as optional secrets ('the quota is a no-op until one is set'). If unset in production, the only guards are the priced-model allowlist and maxTokens clamp — no aggregate cap.
- **Impact:** A single tenant's runaway or abusive usage (a scripted client replaying revision-compare on a large set) creates unbounded OpenAI spend billed to the operator, and heavy concurrent LLM traffic from one tenant can exhaust the shared function's practical throughput for all tenants. Blast radius is primarily financial but is uncontrolled.
- **Fix:** Set both secrets on llm-proxy in the Supabase dashboard (e.g. LLM_DAILY_COST_LIMIT_USD=5, LLM_DAILY_REQUEST_LIMIT=300 per user rolling-24h; takes effect without redeploy) and record the chosen values plus the LLM_KILL_SWITCH break-glass in the incident runbook. Consider a follow-up org-level (not just per-user) cap since a tenant controls how many users it has.

#### ⚪ L45 · Offline field capture silently dropped when localStorage write fails
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/lib/field/offlineQueue.js:66`
- **Issue:** The storage adapter's write() swallows quota/privacy-mode exceptions with the comment 'drop silently; the optimistic UI still holds' (src/lib/field/offlineQueue.js:66-72). saveQueue returns void, so useFieldOutbox.enqueue (src/hooks/useFieldOutbox.js:23-27) cannot detect the failure — the UI shows the capture as pending-synced while it was never durably queued.
- **Impact:** On an iOS private tab or a quota-exhausted device, an offline punch/photo/progress capture is lost the moment the tab closes, with the field user believing it was saved. Narrow conditions, but the failure is invisible.
- **Fix:** Have write() return a boolean, propagate it through saveQueue/enqueue, and toast a 'could not save offline — keep this tab open until you have signal' warning on failure.

```
// offlineQueue.js
write: (value) => {
  try {
    if (typeof localStorage !== "undefined") { localStorage.setItem(STORAGE_KEY, value); return true; }
  } catch { /* quota / privacy mode */ }
  return false;
},
export function saveQueue(queue, storage = localStorageAdapter()) {
  return storage.write(JSON.stringify(Array.isArray(queue) ? queue : []));
}
// useFieldOutbox.js
const enqueue = useCallback((op) => {
  const next = enqueueOp(loadQueue(), op);
  const ok = saveQueue(next);
  setPending(next.length);
  if (!ok) toast.warning("Offline save failed — keep this tab open until you're back online.");
}, []);
```

#### ⚪ L46 · Realtime invalidation never catches up after a websocket drop; missed events are permanently stale
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `src/hooks/useRealtimeInvalidation.ts:56`
- **Issue:** useRealtimeInvalidation subscribes without a status callback (src/hooks/useRealtimeInvalidation.ts:56) — CHANNEL_ERROR/TIMED_OUT/re-SUBSCRIBED transitions are ignored, so postgres_changes events missed during a disconnect are never replayed. Combined with refetchOnWindowFocus:false and 30s staleTime (src/lib/query-client.ts:8,19), a user whose connection blipped can act on stale multi-user data (e.g. a submittal status another PM already changed) for the rest of a long session on the same page.
- **Impact:** Silent multi-user staleness after any network blip — for workflow-authority data (submittal status, ball-in-court) this can cause duplicate or contradictory actions. Workaround exists (navigate away and back).
- **Fix:** Pass a status callback to .subscribe() and invalidate the watched keys once on every (re)SUBSCRIBED transition after the first, so a reconnect forces a catch-up refetch.

```
const hadSubscribed = { current: false };
const channel = supabase
  .channel(channelName)
  .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
    for (const key of queryKeysRef.current) qc.invalidateQueries({ queryKey: key });
  })
  .subscribe((status) => {
    if (status === "SUBSCRIBED") {
      // On any re-subscribe after a drop, refetch to cover events missed offline.
      if (hadSubscribed.current) {
        for (const key of queryKeysRef.current) qc.invalidateQueries({ queryKey: key });
      }
      hadSubscribed.current = true;
    }
  });
```

#### ⚪ L47 · Conflicting repo evidence on the dangling stripe-worker cron caller (404 every ~60s)
- **Severity:** low · **Effort:** S · **Manual step** · unverified-low
- **Location:** `supabase/migrations/20260101000020_baseline_seed.sql:74`
- **Issue:** UNCONFIRMED: supabase/migrations/20260101000020_baseline_seed.sql:74-76 states the stale stripe-sync-worker pg_cron job 'was unscheduled 2026-06-20 and is NOT recreated' (only reconcile-stuck-extractions and escalate-rfi-sla are scheduled, lines 80-81), but CLAUDE.md:736-738 at this same commit still warns 'a dangling caller (cron/pg_cron) still POSTs stripe-worker every ~60s -> 404 in the edge logs; trace and stop that caller.' One of the two is stale; if the caller is real and lives outside pg_cron (e.g. an external scheduler), it is still generating log noise and masking real 404s.
- **Impact:** If unresolved: a permanent 404-per-minute stream in edge logs that buries genuine failures during incident triage; if resolved: a stale operating-contract warning that sends future agents chasing a ghost.
- **Fix:** Run `select jobid, jobname, schedule, command from cron.job;` against prod and check the edge logs for recent stripe-worker 404s; if the caller is gone, delete the stale paragraph from CLAUDE.md §16; if it persists, trace the source (external scheduler/webhook retry) and stop it.

#### ⚪ L48 · Stale operational docs would misdirect an incident responder
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `ARCHITECTURE.md:355`
- **Issue:** ARCHITECTURE.md:355-359 lists stripe-setup / stripe-webhook / stripe-worker as current edge functions (deleted per CLAUDE.md:735-737) and sharepoint-proxy / bluebeam-proxy as 'still deployed' though neither exists in supabase/functions/. TECH_DEBT.md:118-122 still claims 'CI is advisory on the deploy path' and warns a red run 'does not stop the direct-push Vercel deploy' — obsolete since 2026-06-19: vercel.json disables git auto-deploy and the gated Action is the sole production path (.github/workflows/ci.yml:8-13).
- **Impact:** During an incident or onboarding, responders following ARCHITECTURE.md will search for functions that do not exist and mistrust the (actually solid) deploy gate — wasted minutes exactly when they are most expensive.
- **Fix:** Update ARCHITECTURE.md's Edge Functions section to the 6 real functions + _shared, and rewrite the TECH_DEBT.md 'CI is advisory' entry to reflect the CI-gated sole-path deploy (noting the remaining true gap: no branch-protection required check on the free plan).

#### ⚪ L49 · Single-region deployment posture is undocumented
- **Severity:** low · **Effort:** S · unverified-low
- **Location:** `ARCHITECTURE.md:361`
- **Issue:** The entire stack rides one Supabase project (kjrwqagyeswwoxpjkcko) in a single region with no documented statement of that fact, no dependency inventory with SLAs (Supabase, Vercel, OpenAI, Stripe, Sentry, Power Automate), and no stated failover stance. Single-region is a reasonable choice at this stage — the gap is that it is nowhere written down or risk-accepted.
- **Impact:** Enterprise procurement and any future SOC 2 effort will ask for an availability architecture statement; today the answer would have to be reconstructed from memory. No runtime risk by itself.
- **Fix:** Add an 'Availability & dependencies' section to ARCHITECTURE.md: region, the accepted single-region risk, each vendor dependency with its failure mode and the app's degradation behavior (auth fails closed with a clear error, AI degrades to deterministic paths, billing entitlements survive Stripe outages via the org.plan DB anchor).

#### ⚪ L50 · No service worker: offline Field Today dies on reload; queued data becomes unreachable until connectivity returns
- **Severity:** low · **Effort:** M · unverified-low
- **Location:** `vite.config.js:1`
- **Issue:** No service-worker/PWA registration exists anywhere (no serviceWorker/workbox references in src/, index.html, or vite.config.js). The offline outbox therefore only works while the SPA is already loaded in a tab — a field user who reloads (or whose mobile browser evicts the tab) in a no-signal area gets a white screen. Queued ops persist in localStorage so nothing is lost, but nothing new can be captured. Known gap ('no PWA cold-cache yet').
- **Impact:** Field crews in steel erection routinely work in dead zones; the offline capture feature has a sharp edge its users cannot see. Bounded: data already queued survives.
- **Fix:** Add vite-plugin-pwa with a precache-app-shell strategy (cache index.html + hashed assets only; NetworkOnly for Supabase calls so no stale data risk), so a reload offline still boots the shell and the outbox UI.

```
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    // ...existing plugins
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // App shell only — never cache Supabase API/storage responses.
        navigateFallback: '/index.html',
        runtimeCaching: [{
          urlPattern: /^https:\/\/.*\.supabase\.co\//,
          handler: 'NetworkOnly',
        }],
      },
      manifest: { name: 'SteelBuild Pro', short_name: 'SBP', display: 'standalone' },
    }),
  ],
});
```

### Completeness critique — due-diligence dimensions not covered by the 11 domain reviews (vendor viability, support/SLA, pen-test evidence, customer API, OSS licensing, data residency)

The 11 domain reviews cover the technical stack thoroughly but leave the commercial/procurement layer of a buyer's checklist largely unexamined. The most material uncovered gaps are vendor-viability evidence (production Terms/Privacy name "SteelBuild Pro LLC" as operator while project context says the operating legal entity is still TBD — a buyer's counsel checks entity registration on day one), the support/SLA dimension (three advertised mailboxes on steelbuild-pro.com with no verified mail routing, no in-app support surface, no SLA or response-target definition), and third-party security assessment evidence (every audit in docs/audits and CODE_REVIEW_REV2.md is an internal AI-agent review; no external pen test, no /.well-known/security.txt despite the Security page inviting good-faith research). Secondary uncovered items: the raw PostgREST endpoint is already a de facto customer API (the shipped Excel VBA client hits it with the anon key) with no versioning, docs, or deprecation policy; OSS licensing is spot-check clean (318 MIT / 6 Apache / weak-copyleft MPL-2.0 only in web-ifc and dual-licensed dompurify — no GPL/AGPL) but has zero governance (no license CI gate, no THIRD-PARTY-NOTICES, no SBOM); and data residency is favorable (all-US: Supabase us-east-1, Vercel, Stripe) but stated nowhere customer-facing. Consciously acceptable for the US-first steel-fabricator market and noted without findings: no internationalization (English/USD only, no i18n framework), no browser-support matrix (no browserslist, default Vite targets), and no customer-facing changelog/release notes (version pinned at 2.1.1, no git release tags, silent continuous deploys) — the last of these is the next item to add if the finding budget allowed.

**Strengths:**
- OSS license profile is genuinely clean: license-checker --production shows 318 MIT / 19 ISC / 6 Apache-2.0, zero GPL/LGPL/AGPL; the only copyleft is file-level MPL-2.0 (web-ifc@0.0.77, used unmodified — compliant in SaaS) and dompurify is dual MPL-2.0 OR Apache-2.0 (elect Apache)
- Legal pages already carry the raw material a buyer looks for: a named operating entity, distinct support/privacy/security contact addresses, an AS-IS warranty disclaimer, and a good-faith security-research safe-harbor paragraph (src/pages/Security.jsx:141) — unusually complete scaffolding for this stage
- Data residency is simple and favorable for the target market: a single all-US vendor chain (Supabase AWS us-east-1 verified live, Vercel, Stripe) with no cross-border transfers to document away
- package.json is private:true, preventing accidental npm publication of proprietary code
- English-only/USD-only is a defensible conscious non-goal for US structural-steel fabricators rather than an oversight


#### 🟡 M51 · Operating entity named in live Terms may not exist; no insurance or business-continuity evidence for buyer diligence
- **Severity:** medium · **Effort:** M · **Manual step**
- **Location:** `src/pages/Terms.jsx:57`
- **Issue:** Production Terms, Privacy, and Security pages all name "SteelBuild Pro LLC" as the contracting operator (src/pages/Terms.jsx:57, Privacy.jsx:59, Security.jsx:56), but project context records the operating legal entity as still TBD. Nothing in the repo or vendor posture evidences E&O/cyber-liability insurance, and the business has acute key-person concentration (single operator holding the only Supabase, Vercel, Stripe, and GitHub credentials).
- **Impact:** If the LLC is not actually formed and registered, customers are contracting with a nonexistent entity — the liability shield and the ToS indemnification/limitation clauses may be void, and the operator is personally exposed. Enterprise procurement verifies entity registration, insurance certificates, and continuity plans in the first pass; any of the three missing is a questionnaire fail.
- **Fix:** Verify SteelBuild Pro LLC formation with the Arizona Corporation Commission (form it if pending — treat as high priority if unformed since live ToS already name it); obtain a tech E&O + cyber liability policy and keep the certificate ready for questionnaires; write a one-page continuity note covering credential escrow/secondary-owner access for Supabase, Vercel, Stripe, GitHub, and the steelbuild-pro.com domain registrar.

#### 🟡 M52 · No operational support process or SLA behind the advertised support/privacy/security addresses
- **Severity:** medium · **Effort:** S · **Manual step**
- **Location:** `src/pages/Terms.jsx:32`
- **Issue:** The legal pages advertise support@steelbuild-pro.com, privacy@steelbuild-pro.com, and security@steelbuild-pro.com (src/pages/Terms.jsx:32-33 CONTACT block; also Privacy.jsx and Security.jsx), but there is no evidence of mail routing for the steelbuild-pro.com domain (the operator's real mailbox is on a different domain), no in-app Help/Support entry point, no ticketing or response-target definition, and no SLA or availability statement anywhere (Terms only disclaims AS-IS/AS-AVAILABLE).
- **Impact:** A paying tenant's support request — or worse, a security disclosure or GDPR/privacy request sent to the advertised address — may bounce or land unread, breaching commitments the live Privacy Policy already makes. Buyers ask for support hours, response targets, and at least a target uptime posture; today the honest answer to all three is "undefined".
- **Fix:** Stand up mail routing for the three addresses (e.g. Cloudflare Email Routing or Google Workspace forwarding to the operator's real mailbox) and send test mail to each; add a Help/Support link in the app shell pointing at support@; publish a short support statement (channel, business hours, response targets by severity) and a target-uptime sentence on the Security or a new Support page — a formal SLA credit scheme can wait for the first enterprise contract.

#### 🟡 M53 · No third-party penetration-test evidence and no /.well-known/security.txt despite inviting security research
- **Severity:** medium · **Effort:** S · **Manual step**
- **Location:** `src/pages/Security.jsx:141`
- **Issue:** All security assessments in the repo (docs/audits/AUDIT_2026-04-20*.md, CODE_REVIEW_REV2.md, the 2026-06-29 Rev.2 audit) are internal AI-agent reviews. There is no independent penetration test or vulnerability assessment from a third party, and although src/pages/Security.jsx:141 explicitly welcomes good-faith research, public/.well-known/security.txt does not exist (verified — no .well-known directory in public/), so researchers and automated scanners have no machine-readable disclosure channel.
- **Impact:** Enterprise security questionnaires ask for the most recent third-party pen-test report or letter of attestation; internal/self-audits do not qualify regardless of quality. Missing security.txt is a minor but visible hygiene signal that scanners and researchers check first, and it undercuts the safe-harbor language already published.
- **Fix:** Commission an external penetration test (scope: the Vercel frontend, Supabase RLS/PostgREST surface, and the 6 live edge functions; budget-tier firms run $5-15k) and keep the attestation letter for questionnaires. Immediately add public/.well-known/security.txt so it deploys with the static bundle.

```
# public/.well-known/security.txt
Contact: mailto:security@steelbuild-pro.com
Expires: 2027-07-01T00:00:00.000Z
Preferred-Languages: en
Canonical: https://steelbuild-pro.com/.well-known/security.txt
Policy: https://steelbuild-pro.com/Security
```

#### 🟡 M54 · Raw PostgREST endpoint is a de facto customer API with no versioning, documentation, or deprecation policy
- **Severity:** medium · **Effort:** M
- **Location:** `exports/app/build_app_shell.py`
- **Issue:** The shipped Excel "live client" workbook (exports/app/, built by exports/app/build_app_shell.py) authenticates end users with the Supabase anon key and reads/writes production tables directly over PostgREST — making the raw database schema an external integration surface. There is no API documentation, no versioned/stable contract (e.g. a dedicated exposed schema of stable views), and no deprecation or change-notification policy; every schema migration can silently break workbooks already in users' hands.
- **Impact:** Two failure modes: (a) buyers asking "do you have an API?" — a standard checklist item for construction software that must integrate with ERP/accounting — get an undocumented raw-database answer, and (b) the team's own migration cadence (frequent, CI-gated for the frontend only) has no guard for the Excel client, so a routine column rename breaks a customer-facing artifact with zero warning.
- **Fix:** Decide and document the supported integration surface: either (1) expose a minimal versioned read API as a dedicated Postgres schema of stable views (e.g. api_v1) served by PostgREST, point the Excel client at it, and publish a one-page API doc + deprecation policy; or (2) explicitly scope the Excel client as unsupported/internal in docs and the buyer-facing story. Add a checklist item to the migration workflow: "does this change any relation the Excel client or api_v1 reads?"

#### ⚪ L51 · Dependency licensing is clean but ungoverned: no license CI gate, no THIRD-PARTY-NOTICES, no SBOM, no explicit proprietary license field
- **Severity:** low · **Effort:** S
- **Location:** `package.json:1`
- **Issue:** Spot-check (npx license-checker --production) found no copyleft risk: 318 MIT, 19 ISC, 6 Apache-2.0, web-ifc@0.0.77 MPL-2.0 (file-level copyleft, used unmodified — compliant), dompurify dual MPL-2.0-OR-Apache-2.0, and one unverified "MIT*" (rgbcolor@1.0.1, license inferred from README not a LICENSE file). But there is no automated license gate in CI, no THIRD-PARTY-NOTICES/attribution file (Apache-2.0 and MPL-2.0 require notice preservation, and the shipped JS bundle is distribution), no SBOM generation, and package.json omits a license field entirely (license-checker reports the app itself as inferred-UNLICENSED rather than declared).
- **Impact:** A future dependency bump can silently introduce a GPL/AGPL transitive dependency with nothing to catch it, and enterprise security reviews increasingly request an SBOM (CycloneDX/SPDX) and OSS attribution file as standard artifacts — currently neither can be produced on demand.
- **Fix:** Add "license": "UNLICENSED" to package.json; add a CI step `npx license-checker --production --onlyAllow "MIT;ISC;Apache-2.0;BSD-2-Clause;BSD-3-Clause;0BSD;MPL-2.0;(MPL-2.0 OR Apache-2.0);(MIT AND Zlib);MIT AND ISC;CC0-1.0;Unlicense"` (fails the build on anything new); generate THIRD-PARTY-NOTICES via license-checker's --customFormat and an SBOM via `npm sbom --sbom-format cyclonedx` in CI; verify rgbcolor's actual license text once.

#### ⚪ L52 · Data residency is all-US but documented nowhere customer-facing
- **Severity:** low · **Effort:** S
- **Location:** `src/pages/Privacy.jsx:59`
- **Issue:** Verified live: the sole Supabase project (kjrwqagyeswwoxpjkcko) runs in AWS us-east-1, single region, and the full vendor chain (Vercel hosting, Stripe billing, Sentry) is US-based — yet src/pages/Privacy.jsx never states where customer data is stored or processed (grep for "United States"/"stored in"/"region" returns nothing), and the LLM providers reached via llm-proxy have unstated processing locations.
- **Impact:** "Where is our data stored?" is a first-page questionnaire item; today the vendor cannot answer it from published material even though the true answer (US-only, single region) is exactly what a US steel fabricator — including any doing government/DoD-adjacent work with domestic-data expectations — wants to hear. Silence reads as evasion rather than the selling point it actually is.
- **Fix:** Add a "Where your data lives" paragraph to the Privacy and Security pages: primary storage in the United States (Supabase on AWS us-east-1), hosting/CDN via Vercel (US), payments via Stripe (US), AI processing via US-based model providers; note that no customer data is stored outside the US and that no EU residency option is currently offered. Pure copy change, deployable with the existing legal-page cleanup already flagged by the compliance review.
## 4. Remediated Code — Top Ready-to-Apply Patches

Every finding in Section 2 carries an inline fix, and **115 of 133 include ready-to-apply `fix_code`**. Highlighted below are the highest-leverage ones. Treat each as a starting diff — run the validation ladder (`lint` → `typecheck:strict`/`noimplicitany` → `vitest` → `vite build`) and **field-verify** before shipping, per the engineering contract.

### 4.1 — H1 · Viewer-role RLS floor (new migration)

Extend the established i2 pattern (`user_has_project_role_at_least`) to every still-member-writable business table. `field` floor for operational tables, `pm` floor for doc-control/financial. Ship as one migration, verify against a real `viewer` account, then `NOTIFY pgrst, 'reload schema';`.

```sql
-- supabase/migrations/<ts>_viewer_write_floor.sql  (repeat block per table)
drop policy if exists project_insert on public.documents;
drop policy if exists project_update on public.documents;
drop policy if exists project_delete on public.documents;
create policy documents_write on public.documents for all to authenticated
  using      (user_has_project_role_at_least(project_id, 'field'))
  with check (user_has_project_role_at_least(project_id, 'field'));
-- keep the existing member-level SELECT policy

-- doc-control authority — floor at pm (viewer must not flip is_current / delete history)
drop policy if exists drawing_revisions_project_access on public.drawing_revisions;
create policy drawing_revisions_read  on public.drawing_revisions for select to authenticated
  using (user_has_project_access(project_id));
create policy drawing_revisions_write on public.drawing_revisions for all to authenticated
  using      (user_has_project_role_at_least(project_id, 'pm'))
  with check (user_has_project_role_at_least(project_id, 'pm'));
-- Tables to cover: documents, uploaded_files, change_requests, quality_control_records,
-- project_closeout, drawing_transmittals(+items), drawing_reviews, drawing_impacts,
-- drawing_activity, warranties, scope_items, resources, meetings, look_ahead, alerts,
-- email_integration_settings, email_intake_queue, number_sequences, mitigation_actions,
-- drawing_revisions, model_registry, model_element_links, document_folders, project_handoff_items
notify pgrst, 'reload schema';
```

### 4.2 — H26 / H2 · Paginate & complete `project-export` (Storage backup)

The "workspace backup" silently stops at the PostgREST 1000-row cap and covers only 15 tables and no files. Paginate every table via `.range()` and add Storage.

```ts
// supabase/functions/project-export/index.ts
async function fetchAll(sb, table, projectId) {
  const PAGE = 1000; let from = 0; const rows = [];
  for (;;) {
    const { data, error } = await sb.from(table)
      .select('*').eq('project_id', projectId)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}
// + iterate the full project-owned table list (not 15), and list+sign Storage
// objects under the project prefix so drawing PDFs are included in the archive.
```

### 4.3 — H22 · Password reset + change flow

```ts
// reset request (public page)
await auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/update-password` });
// update-password page (after the emailed recovery link establishes a session)
const { error } = await auth.updateUser({ password: newPassword });
// register /update-password in config/routes.js and add a "Forgot password?" link on the login page
```

### 4.4 — H8 · Sentry release + source maps in CI

```yaml
# .github/workflows/ci.yml (build step env)
env:
  SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
  VITE_SENTRY_RELEASE: ${{ github.sha }}
# vite.config: sentryVitePlugin({ release: { name: process.env.VITE_SENTRY_RELEASE }, ... })
# instrument.js: Sentry.init({ release: import.meta.env.VITE_SENTRY_RELEASE, environment: 'production', ... })
```

### 4.5 — H21 / M16 · React Query global error surface

```ts
// src/lib/query-client.ts
import { QueryClient, QueryCache } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      Sentry.captureException(error, { tags: { queryKey: String(query.queryKey?.[0]) } });
      if (query.state.data !== undefined) toast.error('Could not refresh data — showing last known values.');
    },
  }),
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});
```

### 4.6 — H6 · Lock down the deploy workflow

```yaml
# .github/workflows/ci.yml
permissions:
  contents: read          # least privilege; deploy job needs no write scopes
concurrency:
  group: deploy-main
  cancel-in-progress: false   # never cancel an in-flight PROD deploy mid-command
# + pin every action to a commit SHA (actions/checkout@<sha>), and pin the Vercel CLI
#   (npx vercel@<fixed-version>) instead of @latest.
# Manual: enable branch protection / required review on main; scope & rotate VERCEL_TOKEN.
```

### 4.7 — H14 · Collect AZ sales tax (TPT)

Enable **Stripe Tax** on the products, and split the collected tax to a "TPT Payable" liability in the `stripe-billing` webhook rather than treating gross as revenue. *(Also a manual accounting setup — see Section 5.)*

### 4.8 — H15 · Accessibility label lint (stops the bleeding)

```jsonc
// .eslintrc — add jsx-a11y so new code can't ship unlabeled controls
{ "extends": ["plugin:jsx-a11y/recommended"],
  "rules": { "jsx-a11y/label-has-associated-control": "error",
             "jsx-a11y/control-has-associated-label": "error" } }
// then remediate existing inputs: <label htmlFor="rfi-subject">Subject</label>
//                                 <input id="rfi-subject" className="sbd-input" .../>
```

Other high-value `fix_code` blocks (in Section 2 inline): **M17** duplicate-policy consolidation, **L23** unused-index drops, **M14** `auth.uid()`-bound audit attribution, **M40** CSP enforce, **M21** retention purge job, **H16** row keyboard handler pattern, **H17** contrast token corrections.

---

## 5. Remaining Manual Actions (your checklist)

These **50 items** cannot be fixed by a code change alone — they need a dashboard toggle, a legal/accounting decision, a vendor contract, or a human process. Ordered by severity. **This is the enterprise-procurement punch list.**

- **[HIGH] H3 — No staging environment — every change ships straight to the single production environment** (CI/CD & deployment). Minimal staging story on the existing stack: (1) repurpose the already-wired steel-build-pro-rev-2 Vercel project as 'staging', deployed by a new CI job on a `staging` branch (or on every main push, before prod); (2) point it at a separate staging Supabase project (free tier is fine) or a Supabase preview branch (org is on Pro), seeded from the 3-file baseline via `supabase db push`; (3) apply migrations to staging first, run the E2E smoke there, then promote. Re-enable Vercel preview deploys by deleting the ignoreCommand.
- **[HIGH] H4 — Database migrations bypass the pipeline entirely: applied live to prod by hand, no drift detection, no rollback path** (CI/CD & deployment). Add a read-only drift-check job to CI that links the Supabase CLI to prod and fails when repo migrations and remote schema_migrations disagree (db push --dry-run + migration list). Adopt expand/contract discipline for schema changes (additive first, destructive later) so the previous frontend build always works against the new schema, making Vercel instant-rollback a real rollback. Write and rehearse a restore runbook (Supabase Pro daily backup or PITR add-on) once, and record the RTO/RPO.
- **[HIGH] H5 — Edge functions are outside CI/CD: manual npx deploys, no drift detection, deprecated functions still live** (CI/CD & deployment). Add a CI job that deploys all edge functions on push to main when supabase/functions/** changed, encoding the verify_jwt flags in the workflow so they can't be fat-fingered; delete the two deprecated functions from the platform. This also fixes the _shared fan-out (deploy all importers every time).
- **[HIGH] H6 — No branch protection on main: ~10 concurrent agents push directly, and any pusher can tamper with the deploy workflow / exfiltrate VERCEL_TOKEN** (CI/CD & deployment). Upgrade the GitHub org to Team (~$4/user/mo) and enable branch protection on main: require the 'Lint + Typecheck + Test + Build' status check, require PRs (agents merge via PR instead of direct push), block force-pushes/deletions. Until then, reduce blast radius: scope VERCEL_TOKEN to the single project (Vercel supports project-scoped tokens), set a GitHub Actions environment named 'production' holding the Vercel secrets (even without reviewers it centralizes/rotates them), and add a top-level least-privilege permissions block so the ambient GITHUB_TOKEN can't write.
- **[HIGH] H7 — No uptime monitoring, healthcheck endpoint, or status page** (Observability & error handling). Add a lightweight health edge function that checks PostgREST + Auth reachability, point an external monitor (UptimeRobot/Checkly/Sentry Uptime — free tiers suffice) at both https://steelbuild-pro.com and the health function, alerting to email/SMS. Stand up a simple status page (Instatus/BetterStack free tier) for customer-facing incident comms.
- **[HIGH] H8 — Sentry release tagging and source-map upload are almost certainly inactive in production** (Observability & error handling). Create a SENTRY_AUTH_TOKEN (org-scoped, project:releases + org:read) and set it in the Vercel project env (production). Export VITE_APP_VERSION from the git SHA in the CI deploy job so both the runtime init and the vite plugin share one release name. Distinguish preview vs production via VITE_VERCEL_ENV or an explicit env var. Update the stale instrument.js comment.
- **[HIGH] H12 — All three legal pages are live in production while marked unreviewed DRAFT, and signup has no clickwrap acceptance** (Compliance & privacy). 1) Have counsel review/finalize all three pages and remove the DRAFT markers (manual). 2) Add clickwrap: a line under the Create-account button linking /terms and /privacy, and record acceptance version+timestamp in user_metadata at signUp so acceptance is provable per user.
- **[HIGH] H13 — No DPA, and the subprocessor list omits the AI providers that receive customer project data** (Compliance & privacy). 1) Add OpenAI and Anthropic (and Google Fonts if retained) to the Privacy Policy sub-processor list with purpose ('AI-assisted document analysis; API data not used for model training; retained per provider API terms'). 2) Publish a standalone /subprocessors page with a change-notification commitment. 3) Have counsel produce a standard DPA (SCC-ready if EU subjects ever appear) and link it from /terms; execute/confirm DPAs upstream with OpenAI, Anthropic, Supabase, Vercel, Stripe, Sentry, and evaluate OpenAI Zero-Data-Retention for the drawing/email use-cases.
- **[HIGH] H14 — Live Stripe billing collects no sales tax — Arizona TPT liability accruing from first dollar** (Compliance & privacy). Register for an AZ TPT license (manual), enable Stripe Tax in the dashboard (manual), then enable automatic tax on checkout and record the tax split in the webhook's billing_events handling.
- **[HIGH] H18 — No automated regression tests for RLS / tenant isolation — the authoritative authorization boundary** (Testing & quality gates). Add an RLS regression suite. Cheapest path with existing assets: extend the e2e/fixtures/supabaseUser.ts pattern into an API-level test (two seeded users in different orgs) that asserts SELECT returns zero rows and INSERT/UPDATE are rejected across the tenant boundary for each critical table (projects, drawings, submittals, rfis, fab_release_log, sov, expenses, pay apps), run on a schedule or pre-deploy against a staging project. Longer term, pgTAP tests executed by `supabase test db` in CI against a shadow database.
- **[HIGH] H19 — Browser E2E never gates a deploy: opt-in, post-deploy, non-blocking, prod-targeted — and possibly not running at all** (Testing & quality gates). Two steps: (1) manual — set E2E_ENABLED=true plus E2E_USER/E2E_PASS/E2E_SUPABASE_* repo secrets so the post-deploy smoke actually runs, and wire failure notifications; (2) structural — add a blocking pre-promote stage: deploy to a Vercel preview URL first, run the read-only smoke against the preview, and only then promote to production, making the smoke a gate instead of an observer.
- **[HIGH] H22 — No password reset or change-password flow — users cannot recover or rotate credentials** (Auth & session security). Add a 'Forgot password?' link on Landing that calls supabase.auth.resetPasswordForEmail with a redirect to a new public /reset-password page handling the PASSWORD_RECOVERY event, plus a change-password form (updateUser({password})) in Settings. Verify the reset email template and redirect URL allowlist in the Supabase dashboard.
- **[HIGH] H23 — No MFA — no enrollment UI, no verification step, no enforcement** (Auth & session security). Add a TOTP enrollment card in Settings (enroll → QR → challengeAndVerify), gate login completion on AAL when a factor exists, and later add an org setting to require MFA for owner/admin roles. Enable MFA in the Supabase dashboard (Auth → MFA).
- **[HIGH] H24 — No documented backup/DR posture: PITR unverified, no restore test, no RTO/RPO targets anywhere** (Reliability & DR). (1) In the Supabase dashboard confirm daily backups are healthy and enable PITR on the production project; (2) run one full restore rehearsal to a disposable project and time it; (3) commit docs/runbooks/backup-dr.md recording: what is backed up (DB yes / Storage NO — see separate finding), PITR window, RTO/RPO targets, restore procedure step-by-step, and the rehearsal date/result. Re-rehearse quarterly.
- **[HIGH] H25 — Drawing PDFs (Storage buckets) have zero backup/replication — DB backups do not cover them** (Reliability & DR). Stand up an out-of-band bucket sync: a scheduled GitHub Action (or small VM cron) running rclone from Supabase Storage S3-compatible endpoint to an independent bucket (S3/R2/B2) nightly, with versioning enabled on the destination so deletes are recoverable. Additionally add a file manifest (uploaded_files + storage paths + sizes + hashes) to project-export so tenants can verify completeness.
- **[HIGH] H27 — No incident-response runbook, no uptime monitoring, no alert routing, no rollback procedure** (Reliability & DR). Commit docs/runbooks/incident-response.md (detection -> triage -> mitigation -> comms -> postmortem, plus per-dependency playbooks: Supabase down, OpenAI down, Stripe webhook backlog, Vercel rollback via dashboard 'Instant Rollback' or `vercel rollback`), configure Sentry alert rules (new-issue + error-rate spike -> email/phone), and add a free-tier synthetic probe (UptimeRobot/Checkly) on https://steelbuild-pro.com and one edge-function OPTIONS endpoint.
- **[MEDIUM] M5 — schedule-assistant SERVICE_ROLE_OVERRIDE env flag disables RLS for all callers — one config flip breaks tenant isolation** (Edge functions). Delete the override path entirely; if a service-role client is ever needed for diagnostics, gate it behind a separate non-production function. Also verify the env var is unset on the live project.
- **[MEDIUM] M6 — email-ingest: one global shared secret authorizes injection into every tenant's project, and is accepted via URL query param** (Edge functions). Issue a per-project ingest token (store a SHA-256 hash on the projects row or email_accounts), validate it against the URL's project id, accept it ONLY via header, and keep the old global secret temporarily as a dual-accept window for rotation.
- **[MEDIUM] M7 — No default rate limiting anywhere: LLM caps are no-ops until env is set; email-send and email-ingest have no volume guard at all** (Edge functions). Set LLM_DAILY_COST_LIMIT_USD and LLM_DAILY_REQUEST_LIMIT in production (manual, dashboard); add a per-user daily send cap in email-send (count outbound email_messages by sent_by in 24h) and a per-project daily ingest cap in email-ingest, both with sane defaults that env can raise.
- **[MEDIUM] M10 — No post-deploy verification or failure alerting; E2E smoke is opt-in and observe-only with no notification channel** (CI/CD & deployment). Add a cheap curl health check as the last deploy step (fails the run loudly), flip E2E_ENABLED=true with the documented test-account secrets, and add a notify-on-failure step (GitHub issue or Slack webhook) to both deploy and e2e-smoke.
- **[MEDIUM] M12 — VERCEL_TOKEN scope and rotation are ungoverned; no least-privilege permissions block on the workflow** (CI/CD & deployment). Recreate the token scoped to the specific Vercel team/project with the shortest practical expiry, document a rotation cadence (e.g., 90 days) in TECH_DEBT.md or a SECURITY-OPS doc, and add `permissions: contents: read` at the top of ci.yml. Consider moving deploy secrets into a GitHub Actions 'production' environment for central management.
- **[MEDIUM] M13 — Edge functions have zero error tracking or alerting — webhook failures are invisible** (Observability & error handling). Add a shared Sentry Deno init in supabase/functions/_shared/sentry.ts and call captureException + flush in every function's top-level catch (redeploy all importers). Alternatively/additionally configure a Supabase log drain (Datadog/Logflare) with an alert on error-level lines. Also add a scheduled check (pg_cron or GitHub Actions cron) that alerts when llm_telemetry failure rate spikes or email-ingest inserts stop.
- **[MEDIUM] M22 — No enterprise policy/assurance corpus: DPA, security questionnaire answers, SOC 2 roadmap, incident-response and breach-notification plan all absent** (Compliance & privacy). Assemble a minimum assurance pack: 1-page infosec policy, incident-response plan with customer-notification SLA (e.g. 72h), backup/DR statement (document Supabase PITR settings), vendor list with DPA status, and a pre-filled CAIQ-Lite. Publish a /trust or extend /security with it. If enterprise deals materialize, start a SOC 2 Type I via an automation vendor (Vanta/Drata/Secureframe) — the CI gates, RLS boundary, and append-only audit logs already satisfy several controls.
- **[MEDIUM] M23 — Direct pushes to main with no enforced peer review (SOC 2 change-management gap)** (Compliance & privacy). Move the repo to a GitHub org (free orgs get branch protection on private repos) or upgrade the plan; then require PRs with 1 approval into main, keep the existing CI checks as required status checks, and retire the direct-push deploy flow.
- **[MEDIUM] M28 — No accessibility tooling, tests, or conformance documentation (no jsx-a11y lint, no axe tests, no VPAT/ACR, no accessibility statement)** (Accessibility). Add eslint-plugin-jsx-a11y (start with 'recommended' as warnings, promote the rules matching this audit's findings — click-events-have-key-events, label-has-associated-control, no-noninteractive-element-interactions — to errors in CI); add vitest-axe smoke tests for the top 5 core screens; after remediation, produce a WCAG 2.1 AA VPAT using the ITI template and publish an accessibility statement page. The VPAT authoring and statement publication are human/vendor tasks.
- **[MEDIUM] M31 — E2E suite does not exercise the killer workflow's mutations end to end** (Testing & quality gates). Seed a dedicated staging/test org with one sample project (manual, one-time), then extend the harness with a mutation spec per killer-workflow step using stable data-testid selectors: upload a small fixture PDF through DrawingSetUploadModal, advance a submittal one stage, create an RFI, and run fab release with an override reason. Keep it pointed at the test org only (same convention as fab-release-gate.spec.ts) and fold it into the pre-promote gate once stable.
- **[MEDIUM] M35 — Generated Supabase types omit the entire org/billing/tenancy layer** (Frontend architecture & tech debt). Regenerate types against the live project (npm run types:db or the Supabase MCP generate_typescript_types), commit the refreshed src/types/supabase.ts, and diff-review for accidental schema drift. Add a periodic reminder (or a CI drift check comparing generated output) so it cannot lag a schema change by weeks again.
- **[MEDIUM] M40 — Auth tokens in localStorage with CSP still Report-Only — full XSS blast radius** (Auth & session security). Review the Sentry CSP reports accumulated since the header shipped, fix any legitimate violations, then flip the header key from Content-Security-Policy-Report-Only to Content-Security-Policy (optionally keeping the Report-Only variant for a canary period). Keep script-src free of unsafe-inline.
- **[MEDIUM] M42 — Critical auth hardening lives in unverifiable Supabase dashboard settings — needs a manual audit pass** (Auth & session security). Dashboard pass: set min password length ≥ 10 with complexity, enable leaked-password protection, confirm 'Confirm email' is ON, review Auth rate limits, and enable CAPTCHA (Turnstile) on signup/login if bot pressure appears. Record the chosen values in ARCHITECTURE.md so they are auditable.
- **[MEDIUM] M43 — No SSO (SAML/OIDC), no SCIM — enterprise identity integration absent** (Auth & session security). Roadmap item: Supabase Auth supports SAML 2.0 SSO on the Pro plan — add supabase.auth.signInWithSSO({domain}) behind a 'Sign in with SSO' button, with per-org IdP config; start with Google/Microsoft OAuth (signInWithOAuth) as a low-effort stepping stone. SCIM can be deferred but document manual offboarding steps until then.
- **[MEDIUM] M46 — Edge functions deploy out-of-band from CI; repo and production demonstrably drift** (Reliability & DR). Add a path-filtered CI job that deploys functions on merge to main using a SUPABASE_ACCESS_TOKEN secret, preserving each function's verify_jwt setting; at minimum add a nightly drift check comparing `supabase functions list` to the repo directory and failing loudly.
- **[MEDIUM] M48 — Post-deploy verification is opt-in and not enabled — deploys ship with zero runtime smoke** (Reliability & DR). Enable the unauthenticated boot smoke immediately (it needs no test user: page loads, Landing renders, no console errors), and add a cheap curl assertion to the deploy job as a stopgap. Then provision the seeded test user (separate test org) to unlock the authed smoke.
- **[MEDIUM] M49 — email-ingest depends on per-project Power Automate flows with no failure or freshness visibility** (Reliability & DR). Add a per-project freshness indicator computed from max(email_messages.received_at) on the Email Accounts screen with a stale warning (e.g. >3 business days with a connected mailbox), and document the PA-side retry policy (HTTP action: retry 4x exponential) + a monthly flow-health check in the setup doc. Optionally add a daily pg_cron check inserting an alert row when a previously-active mailbox goes quiet.
- **[MEDIUM] M50 — LLM spend caps are disabled by default — likely no per-user cost/volume limit is live** (Reliability & DR). Set both secrets on llm-proxy in the Supabase dashboard (e.g. LLM_DAILY_COST_LIMIT_USD=5, LLM_DAILY_REQUEST_LIMIT=300 per user rolling-24h; takes effect without redeploy) and record the chosen values plus the LLM_KILL_SWITCH break-glass in the incident runbook. Consider a follow-up org-level (not just per-user) cap since a tenant controls how many users it has.
- **[MEDIUM] M51 — Operating entity named in live Terms may not exist; no insurance or business-continuity evidence for buyer diligence** (Completeness critique — due-diligence dimensions not covered by the 11 domain reviews (vendor viability, support/SLA, pen-test evidence, customer API, OSS licensing, data residency)). Verify SteelBuild Pro LLC formation with the Arizona Corporation Commission (form it if pending — treat as high priority if unformed since live ToS already name it); obtain a tech E&O + cyber liability policy and keep the certificate ready for questionnaires; write a one-page continuity note covering credential escrow/secondary-owner access for Supabase, Vercel, Stripe, GitHub, and the steelbuild-pro.com domain registrar.
- **[MEDIUM] M52 — No operational support process or SLA behind the advertised support/privacy/security addresses** (Completeness critique — due-diligence dimensions not covered by the 11 domain reviews (vendor viability, support/SLA, pen-test evidence, customer API, OSS licensing, data residency)). Stand up mail routing for the three addresses (e.g. Cloudflare Email Routing or Google Workspace forwarding to the operator's real mailbox) and send test mail to each; add a Help/Support link in the app shell pointing at support@; publish a short support statement (channel, business hours, response targets by severity) and a target-uptime sentence on the Security or a new Support page — a formal SLA credit scheme can wait for the first enterprise contract.
- **[MEDIUM] M53 — No third-party penetration-test evidence and no /.well-known/security.txt despite inviting security research** (Completeness critique — due-diligence dimensions not covered by the 11 domain reviews (vendor viability, support/SLA, pen-test evidence, customer API, OSS licensing, data residency)). Commission an external penetration test (scope: the Vercel frontend, Supabase RLS/PostgREST surface, and the 6 live edge functions; budget-tier firms run $5-15k) and keep the attestation letter for questionnaires. Immediately add public/.well-known/security.txt so it deploys with the static bundle.
- **[LOW] L4 — pg_net extension installed in the public schema (live-advisor extension_in_public)** (Database security & RLS). Relocate the extension on the live database (requires pg_net >= 0.10): ALTER EXTENSION pg_net SET SCHEMA extensions; then update baseline_extensions.sql's commented guidance so a fresh replay matches. This is a live-DB operation via Supabase MCP/dashboard, not a replayable migration on prod (the baseline is repair-marked).
- **[LOW] L11 — CORS is permissive-by-default in production until ALLOWED_ORIGINS is set (as designed, but should be locked for enterprise posture)** (Edge functions). Set ALLOWED_ORIGINS to the production origins on all browser-facing functions (manual, Supabase dashboard — takes effect without redeploy), and migrate schedule-assistant to the shared corsHeaders(req) helper so the lockdown applies uniformly (email-ingest is webhook-only and can drop CORS entirely).
- **[LOW] L12 — Deprecated edge functions reportedly still deployed (sharepoint-proxy, bluebeam-proxy) plus a dangling stripe-worker caller — stale attack surface and log noise** (Edge functions). Run `npx supabase functions delete sharepoint-proxy --project-ref kjrwqagyeswwoxpjkcko` and the same for bluebeam-proxy; locate and drop the pg_cron job (or external scheduler entry) still POSTing stripe-worker (check `select * from cron.job;`).
- **[LOW] L18 — Dangling stripe-worker caller pollutes edge logs with 404s (~every 60s)** (Observability & error handling). In the Supabase dashboard/SQL editor, list scheduled jobs (select * from cron.job;) and unschedule the stripe-worker POST; also check any external scheduler (Power Automate, GitHub cron). Verify the 404s stop in the edge log explorer.
- **[LOW] L19 — Supabase Auth server pinned to an absolute 10 DB connections (advisor: auth_db_connections_absolute)** (Performance & scalability). In the Supabase dashboard (Project Settings → Auth / database connection settings), change the Auth server's connection allocation from the absolute value (10) to the percentage-based strategy so it scales with compute upgrades. Re-run get_advisors afterwards to confirm the lint clears.
- **[LOW] L23 — Advisor: 171 unused indexes across 93 tables (write amplification), plus 1 unindexed FK in the stripe schema** (Performance & scalability). After 30+ days of production traffic, re-run get_advisors and pg_stat_user_indexes; drop indexes that remain at zero scans on tables belonging to removed/deprecated features first (drawing_zone_*, drawing_revision_comparisons, mitigation_logs), via a reviewed migration. Add the covering index for the stripe FK only if that integration table sees queries.
- **[LOW] L27 — Published compliance contact mailboxes and DSR handling process are unverified** (Compliance & privacy). Provision the three mailboxes (or aliases to a monitored inbox) on the steelbuild-pro.com domain, and keep a simple DSR log (date received, identity verified, action, date completed) — a spreadsheet is sufficient at this stage. Add a 30-day response SLA to the Privacy Policy.
- **[LOW] L29 — Pervasive 8-9px fixed-pixel type on workflow-meaningful chips and labels strains 1.4.4 resize and low-vision readability** (Accessibility). Verify 200%/400% zoom on the hub, Submittals, and Schedule in a browser (manual). Consider raising the chip floor to 10-11px or expressing chip/label sizes in rem so user font-size settings scale them; the StatusPill size map is the single leverage point for chips.
- **[LOW] L37 — Side-project deliverables and unwired dead-code tooling in the app repo** (Frontend architecture & tech debt). Move exports/ and standalone/ to their own repos (the Excel client already has an established identity), or at minimum document them as non-product in README. Wire knip as an advisory CI step (continue-on-error) and add an npm script so it actually runs.
- **[LOW] L41 — No anti-automation on anonymous surfaces (get_invitation RPC, demo_requests insert, signup)** (Auth & session security). Enable Supabase Auth rate limits review + attach Vercel WAF/challenge rules to /rest/v1/rpc/get_invitation and the demo-request path; add Turnstile CAPTCHA to the demo-request and signup forms (Supabase Auth has native CAPTCHA support).
- **[LOW] L42 — No session lifetime controls: no idle timeout, no absolute session cap, no session management UI** (Auth & session security). Set session time-box + inactivity timeout in the Supabase dashboard (Auth → Sessions, Pro feature); add a 'Sign out everywhere' button (signOut({scope:'global'})) in Settings; optionally add a client idle timer for kiosk/shared-device deployments.
- **[LOW] L44 — No email-change flow — users cannot update their sign-in email** (Auth & session security). Add a change-email form in Settings using supabase.auth.updateUser({ email }) (Supabase sends confirmation links to both addresses when 'Secure email change' is enabled — verify that dashboard setting).
- **[LOW] L47 — Conflicting repo evidence on the dangling stripe-worker cron caller (404 every ~60s)** (Reliability & DR). Run `select jobid, jobname, schedule, command from cron.job;` against prod and check the edge logs for recent stripe-worker 404s; if the caller is gone, delete the stale paragraph from CLAUDE.md §16; if it persists, trace the source (external scheduler/webhook retry) and stop it.

---

## Appendix — Live Production Probes (run directly during this audit)

- **RLS coverage:** 103/103 public tables have RLS enabled (`pg_class.relrowsecurity`).
- **`activities` audit trail:** append-only on prod — only INSERT + SELECT policies exist (2026-06-29 mutable-audit finding is FIXED live).
- **`projects` guard:** `trg_enforce_project_update_guard` present on `public.projects` (cross-tenant hijack fix is live).
- **`billing_config` / `billing_events`:** RLS enabled, 0 policies → deny-all to clients (intentional service-role-only).
- **Dangling cron:** `cron.job` id 4 `stripe-sync-worker`, schedule `*/1 * * * *`, active, POSTs the orphan `stripe-worker` edge function.
- **Orphan edge functions still ACTIVE:** stripe-setup, stripe-webhook, stripe-worker, sharepoint-proxy, bluebeam-proxy.
- **Committed bloat:** `.claude/worktrees/gifted-rhodes-7af818/` (~26MB incl. duplicated web-ifc wasm/JS) + `.playwright-mcp/` screenshots tracked on origin/main.
- **`npm audit`:** 0 vulnerabilities / 932 deps.
- **DB:** Postgres 17.6, region us-east-1, ACTIVE_HEALTHY.

_Generated 2026-07-01T22:48Z — audit of commit 642ce154._
