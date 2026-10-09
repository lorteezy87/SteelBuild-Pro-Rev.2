# Operational Acceptance Checklist

**SteelBuild Pro — Enterprise Readiness Remediation**
Original audit: 2026-07-01. Deployment and erasure directions reconciled 2026-10-09.
Scope: Operational checks requiring authorized account access or an owner decision. Automation may perform authorized technical work where credentials permit; legal/entity/tax filings and commercial choices still require the appropriate owner. Unchecked historical items are not proof of current missing configuration. Verify live state and retain evidence before marking an item complete. Current release status is recorded in [the release audit](../audits/PRODUCTION_RELEASE_2026-10-08.md).

Refs:
- Supabase project: `kjrwqagyeswwoxpjkcko`
- Production: `https://steelbuild-pro.com`
- Production Cloudflare Worker: `steelbuild-pro-rev-2`; Vercel is retired.
- GitHub repo: `lorteezy87/SteelBuild-Pro-Rev.2`
- Tier 1 code-vs-owner split: [`tier1-enterprise-status.md`](./tier1-enterprise-status.md)

> How to use: work top-to-bottom within each group. Check the box only when the step is done **and verified** by the stated evidence. Do not mark "done" on a dashboard toggle without re-opening the setting to confirm it stuck.

---

## 1. CI/CD & GitHub

- [ ] **Enable branch protection on `main`** — [H6 / M23]
  - Requires a **GitHub Team plan** (branch protection on private repos is not available on Free).
  - In `Settings → Branches → Add branch ruleset` (or classic branch protection) for `main`:
    - Require status checks to pass before merging; select the **"Lint + Typecheck + Test + Build"** check (the `ci` job in `.github/workflows/ci.yml`).
    - Require branches to be up to date before merging.
    - Block **force-push** and **branch deletion**.
    - Do NOT allow bypass for administrators unless you accept the risk of an owner push skipping CI.
  - Why: today `main` is the live deploy branch with ~10 concurrent agent sessions pushing to it; nothing structurally prevents a force-push or a merge that skipped CI. Protection makes the green CI gate mandatory, not conventional.
  - Verify: attempt a trivial push that fails lint on a throwaway branch → PR → confirm merge is blocked.

- [ ] **Verify scoped Cloudflare publication credentials** — [H6 / M12]
  - Inspect the active Cloudflare workflow and credential scopes; keep production and preview permissions separate where supported. Do not recreate the retired Vercel deployment path.
  - Provision or rotate credentials only through the authorized account flow, retain them as encrypted environment secrets, and record expiry/rotation ownership without copying secret values into the repository or conversation.
  - Verify the tested commit publishes through all five required jobs and both production domains serve that release. A successful credential update alone is not deployment evidence.

- [ ] **Provision distinct reviewed backend deployment credentials** — [H4 / H5]
  - Follow [reviewed backend releases](./reviewed-backend-release.md). `staging-backend` and `production-backend` are main-only environments; production also requires its release reviewer.
  - Store a distinct, narrowly scoped `SUPABASE_BACKEND_ACCESS_TOKEN` in each environment. Do not reuse or expose the repository-wide inventory credential, and do not claim branch-level token isolation without verifying the provider's actual scope.
  - Verify the same function and exact main SHA pass staging deployment and hosted acceptance before the protected production workflow. A listing request alone does not verify deployment or provider delivery.

- [ ] **Add repo secret `SENTRY_AUTH_TOKEN`** — [H8]
  - Create a Sentry auth token with scopes **`project:releases`** + **`org:read`**.
  - Add as GitHub repo secret `SENTRY_AUTH_TOKEN`.
  - Why: enables source-map upload via `@sentry/vite-plugin` during the production build, so Sentry stack traces are de-minified and actually actionable.
  - Verify: after next prod build, open a Sentry issue and confirm frames show original file/line, not minified `index-abc123.js`.

- [ ] **Add E2E secrets + enable the E2E job** — [H18 / H19 / M48]
  - Add GitHub repo **secrets**: `E2E_USER`, `E2E_PASS`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`.
  - Optional additional role coverage: `E2E_VIEWER_USER`/`E2E_VIEWER_PASS`, `E2E_FAB_USER`/`E2E_FAB_PASS`.
  - Add GitHub repo **variable** `E2E_ENABLED=true`.
  - Use a **dedicated E2E test account** in a **non-production org/project** (point `E2E_SUPABASE_URL` at staging once it exists — see next item). Never run destructive E2E against prod data.
  - Why: full-browser E2E is the only bar that catches wiring/RLS/async failures that unit + build pass through (the documented failure mode behind the "done means field-verified" rule).
  - Verify: the E2E workflow runs green on the next push and exercises login → project list → drawing register.

- [~] **Complete hosted staging acceptance** — [H3]
  - A separate Cloudflare staging Worker and persistent Supabase branch `ndyfjffsulfbwpmwdmic` exist. Follow [staging setup](./staging-setup.md) and the current release audit for verified installed SQL and remaining provider/browser checks.
  - Apply only reviewed exact migration payloads and matching ledger stamps manually, following `CLAUDE.md`. Never run `supabase db push`, MCP `apply_migration` or migration repair against this shared lineage.
  - Use the current `STAGING_E2E_*` secrets and guarded workflows; do not copy production provider credentials or customer records into browser artifacts. Confirm the intended staging project before fixture writes.
  - Verify login, relevant steel workflows and real provider test-mode behavior on the exact candidate. A staging Worker or database existing does not prove acceptance.

---

## 2. Supabase Dashboard

- [ ] **Enable PITR and run one restore rehearsal** — [H24]
  - Supabase dashboard → `Database → Backups`: enable **Point-in-Time Recovery** (Pro-plan feature).
  - Perform **one** documented restore rehearsal into the staging project; **record measured RTO and RPO** in `backup-dr.md` rehearsal log.
  - Why: daily backups alone give up to ~24h of data loss; PITR narrows RPO to minutes. An untested backup is not a backup.
  - Verify: rehearsal completes; login + project-list + drawing-register + a signed-URL file open all succeed on the restored copy.

- [~] **Enable and rehearse offsite Storage backup** — [H25]
  - **Code ready (2026-07-22):** `.github/workflows/storage-backup.yml` and `scripts/storage-backup.mjs` cover `app-files` and `email-attachments` with timestamped snapshots, a current mirror, exact path/size checks, aggregate count/byte checks, and a retained manifest.
  - Owner steps: provision a company-owned offsite destination, enable provider-side versioning/soft-delete and lifecycle retention, configure the `storage-backup-production` deployment branches/tags policy to **selected branches** with `main` only before adding environment secrets, then manually run the workflow. A feature-branch `workflow_dispatch` must be rejected/skipped and must not receive production credentials.
  - Rehearse a restore of both buckets into staging and record the manifest timestamp, measured RTO/RPO, and post-restore checks in `backup-dr.md`.
  - Full setup and acceptance criteria: `storage-backup-setup.md`.
  - Verify: the workflow has a green run and manifest for both buckets with `source.projectRef` matching production, failure notifications reach an owner, and the staging restore passes a real signed-file open.

- [ ] **Harden Auth settings** — [M42]
  - Supabase dashboard → `Authentication → Providers/Policies/Settings`:
    - Minimum password length **>= 10** with complexity requirement enabled.
    - Enable **leaked-password protection** (HaveIBeenPwned check).
    - Confirm **"Confirm email"** is **ON**.
    - Review and tighten **rate limits** (sign-in, sign-up, OTP, token refresh).
    - Enable **Turnstile CAPTCHA** on auth endpoints.
  - Why: default auth policy is too permissive for a multi-tenant SaaS holding customer financial/contract data.
  - Verify: attempt a sign-up with a known-breached password → rejected; short password → rejected.

- [ ] **Enable MFA / TOTP + field-verify the shipped flow** — [H23]
  - The **in-app MFA UI is implemented** (2026-07-02): Settings → Profile → Security → "Enable two-factor" (QR enroll + code confirm + remove), and a login **step-up challenge** screen (aal1→aal2) gated at top precedence in `AuthenticatedApp`. Users without MFA are unaffected.
  - Supabase dashboard → `Authentication → Multi-Factor`: confirm **TOTP** is **enabled** at the project level (if the enroll button errors with an MFA-disabled message, this is why).
  - Field-verify: enroll the owner account (`nickl@shsteelaz.com`) via Settings → Security, then sign out and complete a full **password + TOTP** login. (This is the field-verification the shipped code still needs — it was code/build-verified only.)
  - Optional / follow-up: **DB-level enforcement.** The current gate is client-side (UX). To make MFA a hard data boundary, add RLS policies requiring `((auth.jwt()->>'aal') = 'aal2')` on sensitive tables, or require aal2 org-wide. Decide scope before enforcing (it locks out un-enrolled users).
  - Why: single-factor auth on accounts that can read all org project/financial data is below the enterprise bar.

- [ ] **Allowlist the password-reset redirect URL** — [H22]
  - The in-app flow is **implemented** (2026-07-02): "Forgot password?" on the sign-in card emails a reset link; the link opens the app's **`/update-password`** screen (rendered at top precedence for the recovery session); Settings → Profile → Security also lets a signed-in user rotate their password.
  - Supabase dashboard → `Authentication → URL Configuration → Redirect URLs`: add **`https://steelbuild-pro.com/update-password`** (and any preview origins you test from). Without it, the emailed link's redirect is rejected and the reset flow silently breaks.
  - Also confirm the **password-reset email template** exists and renders (`Authentication → Email Templates`).
  - Why: the reset email link's `redirectTo` must be on the allowlist for the recovery session to land on the set-new-password screen.
  - Verify: run a full password reset for a test account end-to-end (request link → open email → set new password → sign in with it).

- [ ] **Change Auth DB connection allocation from absolute to percentage** — [L19]
  - Supabase dashboard → `Settings → Database` (connection pooler / auth allocation): change the Auth service connection allocation from an **absolute 10** to a **percentage-based** allocation.
  - Why: an absolute value doesn't scale with plan/instance changes and can starve auth under load.
  - Verify: setting shows a percentage after save.

- [ ] **Set edge-function environment variables (cost/rate/CORS guards)** — [M50 / M7 / L11]
  - Supabase dashboard → `Edge Functions → Secrets` (or `supabase secrets set`):
    - **LLM spend caps** [M50]: `LLM_DAILY_COST_LIMIT_USD` and `LLM_DAILY_REQUEST_LIMIT` (per-user rolling-24h caps in `llm-proxy`; quota is a no-op until at least one is set). Choose conservative starting values and adjust from telemetry.
    - **Email caps** [M7]: `EMAIL_SEND_DAILY_LIMIT` and `EMAIL_CLASSIFY_DAILY_LIMIT`.
    - **CORS** [L11]: `ALLOWED_ORIGINS` = the real prod origins only (e.g. `https://steelbuild-pro.com`). ⚠ A too-narrow list silently blocks the app's origin (this broke prod AI once). `ALLOWED_ORIGINS=*` or unset = permissive escape hatch; changes take effect ~30–60s, no redeploy.
  - Why: without caps, a runaway loop or abuse can rack up LLM/email spend; without a real CORS allowlist the browser origin is unrestricted.
  - Verify (by runtime outcome, not deploy log): after setting caps, confirm an LLM call still succeeds and produces an `llm_telemetry` success row. After setting `ALLOWED_ORIGINS`, confirm the app's AI features still work from the prod origin (a CORS block returns a green OPTIONS preflight but the function never runs — no telemetry row).

- [ ] **Note: `pg_net` cannot leave `public` schema — accepted** — [L4]
  - No action. `pg_net` reports `does not support SET SCHEMA`, so it stays in `public`. Documented as an accepted deviation from the "no extensions in public" preference.

- [ ] **Re-review 171 unused indexes after 30+ days of real traffic** — [L23]
  - Do **not** drop indexes now. Set a reminder for **>= 30 days** of representative production traffic, then re-run the unused-index advisor and evaluate which are genuinely unused vs. serving rare-but-critical queries.
  - Why: dropping an index that only serves month-end/quarter-end queries can cause a severe regression that won't show in a short window.
  - Verify: advisor re-run dated 30+ days after go-live before any DROP.

---

## 3. Edge Functions — Delete Orphan / Deprecated Functions

**Requires Supabase CLI + `SUPABASE_ACCESS_TOKEN`.** Confirmed historically ACTIVE:
five functions that are either orphaned Stripe Sync Engine leftovers or deprecated
integrations no longer invoked by the client.

- [ ] **Delete the 5 confirmed-active orphan/deprecated functions** — [H5 / L12]

  Preferred (dry-run first, then apply):

  ```bash
  export SUPABASE_ACCESS_TOKEN=…   # dashboard → Account → Access Tokens
  npm run supabase:delete-deprecated-fns          # dry-run
  DRY_RUN=0 npm run supabase:delete-deprecated-fns
  ```

  Equivalent manual CLI:

  ```powershell
  npx supabase functions delete sharepoint-proxy --project-ref kjrwqagyeswwoxpjkcko
  npx supabase functions delete bluebeam-proxy   --project-ref kjrwqagyeswwoxpjkcko
  npx supabase functions delete stripe-setup     --project-ref kjrwqagyeswwoxpjkcko
  npx supabase functions delete stripe-webhook   --project-ref kjrwqagyeswwoxpjkcko
  npx supabase functions delete stripe-worker    --project-ref kjrwqagyeswwoxpjkcko
  ```

  - Context:
    - `sharepoint-proxy`, `bluebeam-proxy` — deprecated integrations; client stack removed, no longer client-invoked.
    - `stripe-setup`, `stripe-webhook`, `stripe-worker` — orphaned Stripe Sync Engine artifacts. The live Stripe webhook is the **`/webhook` route inside `stripe-billing`**, not a separate function.
    - The `stripe-sync-worker` pg_cron job that pinged `stripe-worker` every ~60s **is already unscheduled** — deleting `stripe-worker` removes the dangling 404 target.
  - Why: dead attack surface + noise in edge logs; every deployed function is something to secure and reason about.
  - Verify (by runtime outcome): after deletion, `npx supabase functions list --project-ref kjrwqagyeswwoxpjkcko` no longer lists them; edge logs no longer show `stripe-worker` 404s; billing checkout/portal + webhook still work (do a test-mode checkout).
  - Mandatory CI: keep repo secret `SUPABASE_ACCESS_TOKEN` and variable `SUPABASE_PROJECT_REF` configured; the `supabase-drift` job fails closed when either is absent and fails while these remain deployed.
  - Shared-project ownership and lifecycle are reviewed in [`supabase-production-ownership.md`](./supabase-production-ownership.md); inventory green does not prove SQL or deployed-source equivalence.

---

## 4. Stripe / Tax / Legal / Entity

- [ ] **Register AZ TPT, then enable Stripe Tax** — [H14]
  - Register for **Arizona Transaction Privilege Tax** (TPT) with the AZ Dept. of Revenue. SaaS is treated under the **rental class**; AZ TPT is the seller's tax — charge AZ customers from dollar one, on a separate invoice line.
  - Only **after** TPT registration is live: enable **Stripe Tax** in the Stripe dashboard and mark subscription prices as taxable. Checkout already sends `automatic_tax: { enabled: true }` (+ billing address / tax-id collection) — **redeploy `stripe-billing` after merge**, then verify Tax resolves.
  - Split revenue vs. TPT so the tax portion books to a **"TPT Payable" liability**, not revenue.
  - Why: collecting tax without registration, or booking tax as revenue, are both compliance problems.
  - Verify: a test-mode AZ checkout shows a separate tax line; the webhook records the tax portion to the liability path.

- [~] **Signup clickwrap** — [H12] **Code shipped (2026-07-27):** Landing signup
  requires an affirmative Terms/Privacy checkbox; `signUpWithPassword` refuses to
  mint `terms_accepted_at` metadata unless `termsAccepted: true`. Counsel review
  of the linked legal pages (DRAFT markers) remains owner work below.
- [ ] **Counsel review of Terms / Privacy / Security; remove DRAFT markers** — [H12 / H13]
  - Have legal counsel review the Terms of Service, Privacy Policy, and Security statement. Remove all **"DRAFT"** markers only after sign-off.
  - Why: DRAFT legal pages undermine enterprise buyer trust and may be unenforceable.
  - Verify: published pages carry an effective date and no DRAFT watermark.

- [ ] **Produce a DPA and execute upstream DPAs; evaluate OpenAI ZDR** — [H12 / H13]
  - Produce a **customer-facing Data Processing Addendum** (offer to enterprise customers).
  - Execute **upstream DPAs** with every subprocessor: **Supabase, Vercel, Stripe, Sentry, OpenAI, Anthropic**.
  - Evaluate **OpenAI Zero Data Retention (ZDR)** enrollment for the LLM path (reduces retention exposure of prompt content).
  - Why: multi-tenant SaaS handling customer project/financial data needs a documented processor chain; enterprise procurement will ask for it.
  - Verify: signed DPAs on file for each vendor; DPA template available to prospects.

- [~] **Complete current account-erasure release acceptance** — [H11]
  - The erasure RPCs and an `account-delete` function already exist. Reviewed SQL corrections were applied and payload-verified during the October release; never replay the historical baseline based on this checklist. Use the [release audit](../audits/PRODUCTION_RELEASE_2026-10-08.md) and [identity-preservation candidate](../audits/WORKSPACE_ERASURE_IDENTITY_2026-10-09.md) for exact state.
  - The pending handler separates workspace deletion from self-account deletion: deleting a workspace must preserve its members' Auth identities, including people whose other memberships are changing concurrently. Self-account deletion remains its own authorized operation.
  - Release `account-delete` through the reviewed workflow with gateway JWT verification enabled, after staging MFA/role, Storage and identity acceptance. Preserve immutable financial records and erasure audit evidence according to the tested contract.
  - Verify with explicitly synthetic staging accounts/workspaces. Do not delete customer records, infer acceptance from SQL rollback tests alone, or broadly enable a feature flag without its reviewed release evidence.

- [ ] **Verify / form the operating legal entity + insurance + continuity** — [M51]
  - Verify or form **`SteelBuild Pro LLC`** with the **AZ Corporation Commission** (operating entity is currently TBD; the app must never name S&H Steel as operator/liable party).
  - Obtain **E&O (professional liability)** and **cyber-liability** insurance.
  - Write a brief **business-continuity + credential-escrow note** (who holds/where are the Supabase, Vercel, GitHub, Stripe, domain credentials if the owner is unavailable).
  - Why: a monetized SaaS needs a liable entity, insurance, and a bus-factor plan.
  - Verify: LLC formation confirmation on file; insurance binder on file; continuity note stored with escrowed-credential locations.

- [ ] **Provision role mailboxes + a DSR log** — [L27 / M52]
  - Provision **support@**, **privacy@**, and **security@** mailboxes (aliases acceptable) on the operating domain.
  - Stand up a **Data Subject Request (DSR) log** (spreadsheet or ticketing) to track access/erasure requests and response SLAs.
  - Why: published legal pages must point to monitored contacts; DSRs must be tracked for compliance.
  - Verify: test email to each address is received and monitored; DSR log has a template row.

- [ ] **Commission an external penetration test** — [M53]
  - Engage a reputable third party for an external pen test against prod (coordinate a test window; scope auth, RLS/tenant isolation, edge functions, storage signed-URLs).
  - Why: independent validation of the tenant-isolation boundary before selling to enterprise.
  - Verify: pen-test report received; findings triaged into the backlog.

---

## 5. Observability

- [ ] **Configure Sentry alert rules** — [H7]
  - In Sentry → Alerts: create a **new-issue** alert and an **error-rate spike** alert, both routed to **email + SMS** (owner).
  - Why: errors captured but unwatched don't help; you need to know within minutes of a regression.
  - Verify: trigger a test error and confirm the alert fires to email + SMS.

- [ ] **Add an uptime monitor + status page** — [H27 / H7]
  - The **health endpoint is deployed and live** (2026-07-02): `GET https://kjrwqagyeswwoxpjkcko.supabase.co/functions/v1/health` returns **200** `{"status":"ok","db":"ok",...}` when the API can reach Postgres and **503** `{"status":"degraded","db":"down"}` when it cannot (no auth required, no data exposed). A static frontend-up target also ships at `https://steelbuild-pro.com/health.json`.
  - Stand up an external uptime monitor (**UptimeRobot** / **Better Stack** / **Checkly**) with two checks: the **DB-aware health function** above (expect HTTP 200) and the **app** (`https://steelbuild-pro.com`, expect 200). Add a public/private **status page**.
  - Route downtime alerts to email + SMS.
  - Why: Vercel/Supabase outages and bad deploys need external detection independent of the app itself; the health function distinguishes "frontend up" from "database reachable."
  - Verify: monitor shows green; `curl` the health endpoint returns 200 ok; simulate a check failure (or read the monitor's test-alert) and confirm notification.

- [ ] **Flip CSP from Report-Only to enforcing** — [M40]
  - After reviewing accumulated **`Content-Security-Policy-Report-Only`** violation reports (confirm no legitimate resources are being flagged), change the header in `vercel.json` from `Content-Security-Policy-Report-Only` to enforcing **`Content-Security-Policy`**.
  - This is a code change (`vercel.json`) — coordinate with the repo (see §6 locks); the **owner decision** is *when* the report window is clean enough to enforce.
  - Why: Report-Only observes but does not block; enforcing mode actually mitigates injection.
  - Verify: after flip, app loads with no CSP console violations for legitimate resources; a blocked-inline test is actually blocked.

---

## 6. Owner-Coordination (deferred — active in-repo locks)

These have **ready patches** but touch files currently under active claims by other agent sessions. **Coordinate before applying** (respect `AGENT_CLAIMS.md`); do not overwrite another session's work.

- [x] **command_ui contrast (AA)** — [H17] — **SHIPPED** (commit 2f56ae6f): added `--cmd-good/warn/danger-text` AA tokens + darkened `--cmd-text-muted`; the good/warn/danger chips use them so status text on the pastel fills clears WCAG AA (4.71–4.86:1, verified). Pastel backgrounds + vivid `--cmd-*` FILL hues unchanged — no dark-theming, honors `opus-command-ui-lock`.
  - File: `src/styles/command.css` (intentionally-light Control Center kit).
  - Ready patch: add AA-compliant chip-text tokens while keeping the pastel backgrounds:
    - `--cmd-good-text: #067647`
    - `--cmd-warn-text: #93540b`
    - `--cmd-danger-text: #b42318`
    - `--cmd-text-muted: #57606f`
  - Why: current chip text on pastel fills fails WCAG AA contrast.
  - Verify: contrast checker >= 4.5:1 on chip text over its background; visual spot-check on the RFI/Detailing Control Centers.

- [x] **DataTable keyboard a11y** — [H16] — **SHIPPED** (commit 2f56ae6f): clickable `<tr>` now has `role="button"` + `tabIndex={0}` + an Enter/Space `onKeyDown` mirroring `onClick`; non-clickable rows stay inert.
  - File: `src/components/command/DataTable.tsx`.
  - Ready patch: on the clickable `<tr>`, add `tabIndex={0}`, `role="button"`, and an `onKeyDown` handler that activates the row on **Enter** and **Space** (mirroring the existing `onClick`).
  - Why: clickable rows are mouse-only today — not keyboard-operable, fails a11y.
  - Verify: Tab to a row, press Enter and Space, confirm the same navigation as a click.

- [x] **Remove stale `ignoreCommand` from `vercel.json`** — [L14] — **SHIPPED** (commit 2f56ae6f): removed the dead `ignoreCommand` (git auto-deploy is off; the CI Action is the sole deploy path). Cache-Control headers left intact.
  - File: `vercel.json`.
  - Ready action: remove the stale `ignoreCommand` entry (Vercel git auto-deploy is off; the CI Action is the sole deploy path, so the ignore gate is dead and previously ERRORED Vercel deploys).
  - Why: dead config that has caused deploy errors before; do not reintroduce an in-repo `ignoreCommand`.
  - Verify: after removal + a deploy, the `deploy` job succeeds and no Vercel ignore-command error appears.

---

## Quick reference — finding → item

| Finding | Item |
|---|---|
| H3 | Staging Supabase + Vercel |
| H4, H5 | `SUPABASE_ACCESS_TOKEN`; delete orphan edge fns |
| H6 | Branch protection; `VERCEL_TOKEN` scope/expiry |
| H7 | Sentry alert rules |
| H8 | `SENTRY_AUTH_TOKEN` |
| H11 | Erasure path |
| H12, H13 | Legal review; DPAs; ZDR |
| H14 | AZ TPT + Stripe Tax |
| H16 | DataTable keyboard a11y (locked) |
| H17 | command_ui contrast (locked) |
| H18, H19 | E2E secrets + enable |
| H22 | Password-reset template/redirect |
| H23 | MFA/TOTP |
| H24 | PITR + restore rehearsal |
| H25 | (see backup-dr.md) |
| H27 | Uptime monitor + status page |
| L4 | pg_net accepted |
| L11 | `ALLOWED_ORIGINS` |
| L12 | Delete orphan edge fns |
| L14 | Remove stale `ignoreCommand` (locked) |
| L19 | Auth connection allocation % |
| L23 | Re-review unused indexes @30d |
| L27 | Role mailboxes |
| M7 | Email daily limits |
| M12 | `VERCEL_TOKEN` scope |
| M22 | (see assurance-pack.md) |
| M23 | Branch protection status check |
| M40 | CSP enforce flip |
| M42 | Auth hardening |
| M48 | E2E enable |
| M50 | LLM cost/request caps |
| M51 | Entity + insurance + continuity |
| M52 | DSR log |
| M53 | External pen test |
