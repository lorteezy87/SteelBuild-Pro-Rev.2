# Staging Environment — Setup Runbook (H3)

**SteelBuild Pro — Enterprise Readiness**
Purpose: stand up a pre-production environment so schema migrations, edge-function changes, RLS changes, DR-restore rehearsals, and destructive features (e.g. H11 erasure) can be validated **off production**. Today every change is validated against live prod — this removes that risk.

> The **code half is already shipped**: `.github/workflows/ci.yml` has a guarded `deploy-staging` job that deploys the `staging` branch to a separate Vercel project. It is **inert** until you complete the owner steps below and set `STAGING_ENABLED=true`.

Refs:
- Production Supabase: `kjrwqagyeswwoxpjkcko` · Production Vercel: `steelbuildpro-og` · Repo: `lorteezy87/SteelBuild-Pro-Rev.2`

---

## Architecture

```
 feature branch ──PR──▶  main  ──CI gate──▶  PRODUCTION (steelbuildpro-og  →  Supabase kjrwqagyeswwoxpjkcko)
                          │
                          └─(promote)─▶  staging branch ──CI gate──▶  STAGING (new Vercel proj → new Supabase proj)
```

- **Two Supabase projects**: prod (existing) + a new **staging** project (own DB, own keys, own storage).
- **Two Vercel projects**: prod (`steelbuildpro-og`) + a **staging** Vercel project whose env `VITE_SUPABASE_*` point at the **staging** Supabase project (never prod).
- The **same `ci` gate job** (lint/typecheck/test/build) runs before both deploys — no drift.

---

## Owner steps (one-time)

> ⚠ When creating the staging Supabase project, **do NOT connect the GitHub integration** (the "update schema in code, push to GitHub, Supabase deploys automatically" option). It would auto-apply migrations on push, which breaks the "staging first, then prod" model and diverges from how prod applies migrations (manually). Migrations go to staging via `supabase db push --project-ref <staging-ref>`.

### 1. Create the staging Supabase project
- Supabase dashboard → **New project** (same org, same region `us-east-1`). Name it e.g. `SteelBuild-Pro-staging`.
- Note its **project ref**, **URL**, **anon key**, **service-role key**.
- Apply the schema: from a checkout, `npx supabase db push --project-ref <staging-ref>` (applies everything in `supabase/migrations/`). Then deploy edge functions to staging: `npx supabase functions deploy <name> --project-ref <staging-ref>` (repeat per function; match each function's `verify_jwt` — see CLAUDE.md §16).
- Seed a **throwaway test org + project** for rehearsals (never copy real customer data into staging).

### 2. Create the staging Vercel project
- Vercel → **Add New Project** → import the same repo. Name e.g. `steelbuild-pro-staging`.
  - (You can repurpose the existing preview-only `steel-build-pro-rev-2` project instead of making a new one.)
- **Disable Vercel git auto-deploy** for it (Settings → Git → turn off, mirroring prod) so the GitHub Action is the only deploy path.
- Set its **Environment Variables** (Production scope): `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` = the **staging** Supabase values from step 1. Add `VITE_SENTRY_DSN` (optional; a separate Sentry env/project for staging is cleaner).
- Note its **Project ID**.

### 3. Add GitHub secrets + variables
Repo → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `STAGING_VERCEL_PROJECT_ID` | staging Vercel project ID (step 2) |
| Secret | `STAGING_VERCEL_TOKEN` | a Vercel token scoped to the staging project |
| Variable | `STAGING_ENABLED` | `true` |
| Variable | `STAGING_BASE_URL` | staging URL, e.g. `https://steelbuild-pro-staging.vercel.app` (optional — enables the post-deploy health check) |
| Variable | `STAGING_E2E_ENABLED` | `true` after all four staging E2E secrets below exist |
| Secret | `STAGING_E2E_USER` | synthetic staging-only confirmed user |
| Secret | `STAGING_E2E_PASS` | synthetic staging-only password |
| Secret | `STAGING_E2E_SUPABASE_URL` | staging Supabase URL |
| Secret | `STAGING_E2E_SUPABASE_ANON_KEY` | staging browser anon key |

`VERCEL_ORG_ID` and `SENTRY_AUTH_TOKEN` are reused from the existing prod secrets (same Vercel team).

### 4. Create the `staging` branch
```bash
git checkout main && git pull
git checkout -b staging && git push -u origin staging
```
The push triggers CI → `deploy-staging` → staging site goes live. Confirm `STAGING_BASE_URL` serves 200.
When enabled, authenticated read-only smoke runs next. See
`docs/runbooks/staging-e2e-automation.md` for bootstrap and mutation isolation.

---

## Day-to-day promotion flow (once staging exists)

1. **Migrations / edge / RLS / destructive features** — apply to **staging first**:
   - `npx supabase db push --project-ref <staging-ref>` (or MCP `apply_migration` against staging).
   - Deploy any changed edge functions to staging; field-verify against the staging app.
2. Merge/promote the branch to **`staging`**, let CI deploy, and **exercise the change** on the staging site.
3. Only after it passes on staging: apply the same migration to **prod** and merge to **`main`** (the existing prod pipeline deploys the frontend).
4. Keep `supabase/migrations/` as the single source of truth applied to **both** projects, in the same order (see the migration-replay note in memory).

## DR-restore rehearsal target (H24)
Use the staging **Supabase** project as the restore target for the PITR rehearsal: restore a prod backup into staging, then verify login + project-list + drawing-register + a signed-URL file open. Record measured RTO/RPO in `backup-dr.md`.

## As-built (provisioned 2026-07-03)
- **Staging Supabase project**: `SteelBuild-Pro Staging` · ref **`abbeavtbifuddtrifvae`** · region `us-east-1` · URL `https://abbeavtbifuddtrifvae.supabase.co`. Schema applied via `supabase db push` (16 migrations; parity-verified vs prod: 103 tables, 103/103 RLS, 52 definer fns). Edge functions NOT yet deployed to staging (deploy per-function when rehearsing an edge/LLM/billing change; needs staging secrets incl. Stripe **test-mode** keys).
- **Staging Vercel project**: `steelbuild-pro-staging` · project id `prj_W0dhGzRfU3uQPkqxZLhnzwXTMQO8` · URL **https://steelbuild-pro-staging.vercel.app**.
- **GitHub secrets/vars set**: `STAGING_VERCEL_PROJECT_ID`, `STAGING_VERCEL_TOKEN`, `STAGING_ENABLED=true`, `STAGING_BASE_URL=https://steelbuild-pro-staging.vercel.app`.
- **`staging` branch** created from `origin/main`; first `deploy-staging` run green.
- `vercel.json` `git.deploymentEnabled` = `{ main:false, staging:false }` so Vercel git auto-deploy is off for both — the GitHub Action (`--prebuilt`) is the sole deploy path for both environments.
- ⚠ The `STAGING_VERCEL_TOKEN` was pasted in a chat transcript during setup — rotate it once convenient (`gh secret set STAGING_VERCEL_TOKEN` with a fresh Vercel token).

## Rollback
- **Frontend**: Vercel → staging project → Deployments → promote a previous deployment. (Prod identically.)
- **Database**: staging is where you prove a migration is reversible *before* prod. There is no automatic DB rollback in prod — write down-migrations or a documented reversal for anything risky, and rehearse it on staging first.

## Batch 42 candidate reconciliation

- The expected staging targets remain the separate `steelbuild-pro-staging`
  Vercel project and the separate Supabase staging project described above.
- This runbook contains no credential values. Secret names are references to
  GitHub, Vercel, Supabase, Stripe, Sentry, and provider secret stores only.
- The existing as-built statements require owner re-verification during the
  staging run. Batch 41 did not independently verify migration history, Edge
  Function revisions, secret parity, backup freshness, or Storage policy state
  from the local checkout.
- The legacy flat Storage finding is accepted for the current single-tenant
  staging candidate because no active leak is established by the available
  evidence. It remains a hard gate before organization #2 and must be reviewed
  with the legal-review gate.
- No staging deploy, migration application, Edge Function deployment, or remote
  setting change is authorized by Batch 42 itself.
