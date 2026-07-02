# Owner / Human-Only Action Checklist

**SteelBuild Pro — Enterprise Readiness Remediation**
Date: 2026-07-01
Scope: Actions that **only a human with owner-level credentials** can perform (dashboard toggles, plan upgrades, secret provisioning, CLI operations not available to automation, legal/entity/tax filings, external vendor sign-up). Each item cites the originating audit finding.

Refs:
- Supabase project: `kjrwqagyeswwoxpjkcko`
- Production: `https://steelbuild-pro.com`
- Vercel project: `steelbuildpro-og`
- GitHub repo: `lorteezy87/SteelBuild-Pro-Rev.2`

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

- [ ] **Recreate `VERCEL_TOKEN` scoped to a single project, 90-day expiry** — [H6 / M12]
  - In Vercel `Account Settings → Tokens`: delete the current broad token, create a new one **scoped to the `steelbuildpro-og` project only**, expiry **90 days**.
  - Update the GitHub repo secret `VERCEL_TOKEN` with the new value.
  - Add a recurring calendar reminder to **rotate every 90 days** before expiry (a lapsed token silently breaks the `deploy` job — deploys stop, prod stays on last good build).
  - Why: a broad, non-expiring deploy token is a standing blast-radius risk; scoping + expiry limits damage from a leaked secret.
  - Verify: trigger a deploy after rotation; confirm the `deploy` job in the Action run succeeds.

- [ ] **Add repo secret `SUPABASE_ACCESS_TOKEN`** — [H4 / H5]
  - Generate a Supabase personal access token (Supabase dashboard → Account → Access Tokens).
  - Add as GitHub repo secret `SUPABASE_ACCESS_TOKEN`.
  - Why: enables CI/automation to deploy edge functions and manage the project via the Supabase CLI (`--project-ref kjrwqagyeswwoxpjkcko`) without interactive login. Also the prerequisite for automating edge-function deploys (currently manual).
  - Verify: run a no-op `npx supabase functions list --project-ref kjrwqagyeswwoxpjkcko` in the CI environment (or locally with the token exported) and confirm it authenticates.

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

- [ ] **Stand up staging Supabase + staging Vercel** — [H3]
  - Create a **separate staging Supabase project** (own DB, own keys) so migrations and edge functions can be rehearsed off-prod.
  - Repurpose the existing second Vercel project **`steel-build-pro-rev-2`** (currently preview-only, slated for retirement) as the **staging deploy target** wired to a `staging` branch and the staging Supabase env.
  - Why: there is currently no pre-production environment — every schema/edge change is validated against live prod. Staging gives a safe rehearsal surface for DR restores, migrations, and E2E.
  - Verify: a push to `staging` deploys to the staging Vercel URL against the staging Supabase project; prod is untouched.

---

## 2. Supabase Dashboard

- [ ] **Enable PITR and run one restore rehearsal** — [H24]
  - Supabase dashboard → `Database → Backups`: enable **Point-in-Time Recovery** (Pro-plan feature).
  - Perform **one** documented restore rehearsal into the staging project; **record measured RTO and RPO** in `backup-dr.md` rehearsal log.
  - Why: daily backups alone give up to ~24h of data loss; PITR narrows RPO to minutes. An untested backup is not a backup.
  - Verify: rehearsal completes; login + project-list + drawing-register + a signed-URL file open all succeed on the restored copy.

- [ ] **Harden Auth settings** — [M42]
  - Supabase dashboard → `Authentication → Providers/Policies/Settings`:
    - Minimum password length **>= 10** with complexity requirement enabled.
    - Enable **leaked-password protection** (HaveIBeenPwned check).
    - Confirm **"Confirm email"** is **ON**.
    - Review and tighten **rate limits** (sign-in, sign-up, OTP, token refresh).
    - Enable **Turnstile CAPTCHA** on auth endpoints.
  - Why: default auth policy is too permissive for a multi-tenant SaaS holding customer financial/contract data.
  - Verify: attempt a sign-up with a known-breached password → rejected; short password → rejected.

- [ ] **Enable MFA / TOTP** — [H23]
  - Supabase dashboard → `Authentication`: enable **TOTP MFA**.
  - Encourage/require owner + admin accounts to enroll.
  - Why: single-factor auth on accounts that can read all org project/financial data is below enterprise bar.
  - Verify: enroll the owner account (`nickl@shsteelaz.com`) in TOTP and complete a full MFA login.

- [ ] **Verify password-reset template + redirect allowlist** — [H22]
  - Supabase dashboard → `Authentication → Email Templates`: confirm the **password-reset** template exists and renders.
  - `Authentication → URL Configuration → Redirect URLs`: confirm the allowlist includes the app's **`/reset-password`** route (e.g. `https://steelbuild-pro.com/reset-password`).
  - Why: a missing/incorrect redirect allowlist entry silently breaks the self-serve reset flow.
  - Verify: run a full password reset for a test account end-to-end.

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

**Requires Supabase CLI (not available to automation).** Confirmed **ACTIVE** as of 2026-07-01: five functions that are either orphaned Stripe Sync Engine leftovers or deprecated integrations no longer invoked by the client.

- [ ] **Delete the 5 confirmed-active orphan/deprecated functions** — [H5 / L12]

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

---

## 4. Stripe / Tax / Legal / Entity

- [ ] **Register AZ TPT, then enable Stripe Tax** — [H14]
  - Register for **Arizona Transaction Privilege Tax** (TPT) with the AZ Dept. of Revenue. SaaS is treated under the **rental class**; AZ TPT is the seller's tax — charge AZ customers from dollar one, on a separate invoice line.
  - Only **after** TPT registration is live: enable **Stripe Tax**. The code already has an `automatic_tax` scaffold behind a `billing_config` flag — **turn that flag on only after Stripe Tax is active**, and split revenue vs. TPT so the tax portion books to a **"TPT Payable" liability**, not revenue.
  - Why: collecting tax without registration, or booking tax as revenue, are both compliance problems.
  - Verify: a test-mode AZ checkout shows a separate tax line; the webhook records the tax portion to the liability path.

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

- [ ] **Decide and execute the data-erasure path** — [H11]
  - The scaffolding exists (an **org-delete edge function** and a **`hard_delete_project` RPC**) but is **NOT wired to a live UI button**.
  - Decide the erasure policy (self-serve vs. support-mediated), then either wire it to a guarded UI action or document the support-executed procedure. Must cover Postgres rows **and** Storage objects (`app-files`, `email-attachments`).
  - Why: GDPR/CCPA "right to erasure" and enterprise offboarding require a real, auditable delete path.
  - Verify: run a full org/project erasure on a test tenant and confirm DB rows + storage objects are gone.

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

- [ ] **Add an uptime monitor + status page** — [H27]
  - Stand up an external uptime monitor (**UptimeRobot** or **Checkly**) checking the **app** (`https://steelbuild-pro.com`) and a **health endpoint**, with a public/private **status page**.
  - Route downtime alerts to email + SMS.
  - Why: Vercel/Supabase outages and bad deploys need external detection independent of the app itself.
  - Verify: monitor shows green; simulate a check failure (or read the monitor's test-alert) and confirm notification.

- [ ] **Flip CSP from Report-Only to enforcing** — [M40]
  - After reviewing accumulated **`Content-Security-Policy-Report-Only`** violation reports (confirm no legitimate resources are being flagged), change the header in `vercel.json` from `Content-Security-Policy-Report-Only` to enforcing **`Content-Security-Policy`**.
  - This is a code change (`vercel.json`) — coordinate with the repo (see §6 locks); the **owner decision** is *when* the report window is clean enough to enforce.
  - Why: Report-Only observes but does not block; enforcing mode actually mitigates injection.
  - Verify: after flip, app loads with no CSP console violations for legitimate resources; a blocked-inline test is actually blocked.

---

## 6. Owner-Coordination (deferred — active in-repo locks)

These have **ready patches** but touch files currently under active claims by other agent sessions. **Coordinate before applying** (respect `AGENT_CLAIMS.md`); do not overwrite another session's work.

- [ ] **command_ui contrast (AA) — under `opus-command-ui-lock`** — [H17]
  - File: `src/styles/command.css` (intentionally-light Control Center kit).
  - Ready patch: add AA-compliant chip-text tokens while keeping the pastel backgrounds:
    - `--cmd-good-text: #067647`
    - `--cmd-warn-text: #93540b`
    - `--cmd-danger-text: #b42318`
    - `--cmd-text-muted: #57606f`
  - Why: current chip text on pastel fills fails WCAG AA contrast.
  - Verify: contrast checker >= 4.5:1 on chip text over its background; visual spot-check on the RFI/Detailing Control Centers.

- [ ] **DataTable keyboard a11y — under `opus-command-ui-lock`** — [H16]
  - File: `src/components/command/DataTable.tsx`.
  - Ready patch: on the clickable `<tr>`, add `tabIndex={0}`, `role="button"`, and an `onKeyDown` handler that activates the row on **Enter** and **Space** (mirroring the existing `onClick`).
  - Why: clickable rows are mouse-only today — not keyboard-operable, fails a11y.
  - Verify: Tab to a row, press Enter and Space, confirm the same navigation as a click.

- [ ] **Remove stale `ignoreCommand` from `vercel.json` — under `opus-lazychunk-cache`** — [L14]
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
