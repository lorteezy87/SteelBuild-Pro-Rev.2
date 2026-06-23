# GTM Readiness Batch — Handoff (2026-06-22)

Autonomous batch from the go-to-market backlog. Recon mapped all 13 items first
(several were already done). This documents what SHIPPED, what needs YOU, and the
review-required storage backfill.

## 1. Shipped (validated; deploys with this push)

| Item | What | Field-verify after deploy |
|---|---|---|
| **Security headers** | `vercel.json`: added `Strict-Transport-Security` (1y, includeSubDomains), `Permissions-Policy` (disables unused mic/usb/serial/bluetooth/midi), and **`Content-Security-Policy-Report-Only`** (observe-only, violations → Sentry). | App still loads normally (Report-Only never blocks). Then check Sentry for CSP reports / DevTools console for `[Report Only]` violations across: Sentry load, Google Fonts, PDF viewer, 3D/IFC viewer, Stripe checkout. |
| **Legal pages** | New `Privacy`/`Terms`/`Security` pages (dark-themed, public). `App.jsx` serves `/privacy` `/terms` `/security` above the auth gate (case-insensitive). Footer links wired. | Visit `/privacy` `/terms` `/security` logged-OUT — they render; footer links work; "← Back to home" returns to `/`. |
| **Demo form** | Landing "Request a demo" now inserts into `public.demo_requests` (migration `20260623032908`; anon column-scoped INSERT, admin-only SELECT) with submit/error states. | Submit the demo form on the landing page → success panel; confirm a row lands in `demo_requests` (`select * from demo_requests order by created_at desc limit 5;`). |
| **CI engines** | `package.json` `engines.node >= 20` (advisory). | — |
| **Dependency advisory** | Already resolved — `npm audit` = 0. No change. | — |

## 2. ⚠️ Needs YOU (owner actions / decisions)

- **Demo email-notify** (you chose "DB table + email notify" — DB done, email pending). Two clean options:
  1. **Supabase Database Webhook** (Dashboard → Database → Webhooks): on INSERT to `demo_requests`, POST to your email/Slack endpoint. ~2 min, no code.
  2. A small public `demo-request` edge function (insert via service role + send email). I can write it next; you deploy it. Pick one and I'll wire it.
- **Flip CSP to enforcing.** After ~a few days of clean Report-Only reports (Sentry), change the header key from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `vercel.json`. Loosen any directive that shows legitimate violations FIRST.
- **Legal content → counsel review.** The three pages are standard boilerplate, flagged `// DRAFT …` in-file. Replace with counsel-reviewed text before relying on them.
- **Enable signed-in E2E.** The harness + 3 specs already exist; they're gated off. To turn on: set repo **variable** `E2E_ENABLED=true`, create a dedicated test user + sample project, and set secrets `E2E_USER`, `E2E_PASS`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` (+ optional `E2E_FAB_*` / `E2E_VIEWER_*` for the fab-gate spec). See `e2e/README.md`.
- **Sentry alert rules.** Error capture is live; alerting is not. In the Sentry dashboard add rules (error-rate spike, new-issue, performance regression) → your notification channel (Slack/email). Optional: uptime check (UptimeRobot/Pingdom) + a deploy-notification step.

## 3. Storage path backfill — RUNBOOK (review required, do NOT rush)

**Goal:** move ~775 legacy FLAT `uploads/<file>` objects in the `app-files` bucket
(out of 1170 total) to org-scoped `<founding_org_id>/uploads/<file>` paths, then
close the RLS grandfather branch — required before a SECOND org joins the founding
workspace (today all founding-org members can read every legacy file regardless of
project). **Low severity while S&H Steel is the only tenant.**

Ordered steps (reversible until step 4):

1. **Copy objects (storage only).** `scripts/storage-backfill-legacy-uploads.mjs`
   — DRY-RUN first (`node scripts/...` with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`),
   review the planned copies, then re-run with `APPLY=1`. Idempotent; does NOT
   delete originals or touch the DB.
2. **Backfill the 14 DB `file_url` columns.** For each of `drawing_revisions,
   document_import_queue, documents, drawing_analyses, drawings, drawing_sets,
   model_registry, photos, punchlist_items, scope_items, submittal_rounds,
   submittal_sheet_responses, submittals, uploaded_files` — rewrite the stored path
   prefix `uploads/…` → `<founding_org_id>/uploads/…`. CONFIRM each table's actual
   column name first (some may differ from `file_url`). Template per table:
   ```sql
   update public.<table>
   set <file_url_col> = '<FOUNDING_ORG_ID>/' || <file_url_col>
   where <file_url_col> like 'uploads/%';
   ```
   Run inside a transaction, table by table; keep a count of rows changed.
3. **Verify.** Sample ~20 rewritten rows across tables and confirm `getSignedUrl`
   resolves on the new path (the bytes moved in step 1). Spot-check the app: open a
   few drawings/photos/submittal attachments.
4. **Cut the legacy RLS branch** (the point of no return). New migration that drops
   the `'uploads'`-prefix grandfather branch from the `app-files` SELECT/UPDATE
   policies (see `migrations_archive/20260616000000_app_files_storage_org_isolation.sql`
   for the branch). After this, only `<org_id>/…` paths are readable.
5. **Cleanup (optional, later).** Once confident, delete the now-orphaned flat
   `uploads/*` objects.

**Risks:** the copy→backfill window has files in both paths (don't run concurrent
uploads/deletes against legacy paths during it). Reversible until step 4. Any
EXTERNAL system that hardcoded a `uploads/...` path/signed-URL breaks after step 4
— check archived emails / integrations first.

## 4. Deferred (flagged, not in this batch)

- **a11y / mobile / tablet polish** (recon: L effort). Responsive + field-thumb-
  optimized layouts exist; gaps are dense-list keyboard nav, sub-40px touch targets
  in modals, sparse ARIA, real-device verification. Note: `eslint-plugin-jsx-a11y`
  would be neutered by the current `lint --quiet`; a real pass should triage existing
  warnings, drop `--quiet`, and field-test on an actual iPad/iPhone.
- **CI extras:** branch protection is unavailable (private repo, free GitHub plan);
  test-duration tracking + dropping `lint --quiet` are nice-to-haves.
