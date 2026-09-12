/**
 * Tier 1 — Enterprise readiness status (2026-07-27)
 *
 * Companion to `owner-checklist.md`. Separates **code-complete** items from
 * **owner-only** dashboard / legal / credential work so score progress is honest.
 */

## Already code-complete (verify / enable in dashboards)

| Item | Code status | Owner still needs |
|---|---|---|
| Storage backup automation | `.github/workflows/storage-backup.yml` + `scripts/storage-backup.mjs` | Offsite secrets, first green run, staging restore rehearsal → record in `backup-dr.md` |
| DR runbook + RTO/RPO targets | `docs/runbooks/backup-dr.md` | Enable PITR; one restore drill with measured RTO/RPO |
| Viewer write floor (field) | `20260702034009_viewer_write_role_floor_restrictive.sql` (34 tables) | Apply / confirm live if any staging lag |
| Viewer→PM authority floor | `20260727053000_pm_floor_authority_tables.sql` (this PR) | `supabase db push` / apply migration on prod + staging |
| Password reset + MFA UI | Landing forgot-password, `/update-password`, Settings MFA, login step-up | Enable TOTP in Auth; allowlist redirect URLs; field-verify enroll+login |
| Hard erasure path | `account-delete` edge fn + RPCs + DangerZone UI (flag-gated) | Deploy function; flip feature flag when ready |
| Staging pipeline | `deploy-staging` + staging E2E jobs in `ci.yml` | Secrets/vars already partially as-built — keep edge fns deployed to staging |
| Legacy 775 uploads backfill | Completed in prod 2026-07-20 | Optional: delete retained originals |
| Signup clickwrap | Landing checkbox + AuthContext gate (this PR) | Counsel review; remove DRAFT markers |
| Stripe Tax hooks | `automatic_tax` + address/tax-id on checkout (this PR) | AZ TPT registration; enable Stripe Tax in dashboard; redeploy `stripe-billing` |
| CI owns frontend deploy | Gated Vercel deploy; `vercel.json` `main=false` (restored this PR) | Branch protection (GitHub Team); scoped `VERCEL_TOKEN` |
| Supabase drift check | `npm run supabase:drift` + mandatory CI job + reviewed shared-project ownership manifest | Keep `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` configured; resolve manifest blockers |
| Dead edge fn delete helper | `npm run supabase:delete-deprecated-fns` (this PR) | Run with `DRY_RUN=0` against prod |

## Still blocked on humans (cannot close from a PR alone)

1. GitHub branch protection on `main` (plan upgrade / ruleset).
2. PITR enable + restore rehearsal evidence.
3. Storage backup first verified manifest + restore rehearsal.
4. Counsel-reviewed legal pages / DPA / subprocessors contracts.
5. Stripe Tax live in dashboard + AZ TPT registration.
6. Remote delete of deprecated edge functions (token + CLI).
7. Optional: org-level MFA enforcement via `aal2` RLS (product decision).

## Score impact (honest)

Closing the **code** gaps in this PR moves enterprise readiness from “mostly documented” toward “mostly implementable.” The jump from ~6.5 → ~8.5 still requires the owner checklist evidence rows (PITR, restore drill, Tax live, branch protection, dead-fn delete, counsel sign-off).
