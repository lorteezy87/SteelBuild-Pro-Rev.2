# Authenticated staging E2E automation

`staging-e2e-readonly` runs after staging deploy. It first selects
`e2e/smoke.spec.ts` and `e2e/daily-workflow.spec.ts`, then starts a second
Playwright invocation for `e2e/staging-auth-boundary.spec.ts`. The boundary
spec proves an unauthenticated browser cannot render a protected register and
then signs out the synthetic staging user. Keeping sign-out in the final
invocation prevents it from invalidating the session used by the navigation
smoke. The suite does not create, update, or delete project data. Environment
guards reject the production app host and any Supabase ref other than staging
`abbeavtbifuddtrifvae`.

## One-time confirmed fixture

Because staging email confirmation is enabled, use the isolated
`staging-e2e-bootstrap` function rather than public signup.

1. Apply `20260721030200_harden_trigger_and_split_write_policies.sql` to staging.
2. Generate a random preimage in memory and store only its SHA-256 digest:

   ```sql
   update private.maintenance_jobs
   set token_sha256 = '<64-lowercase-hex-digest>', completed_at = null,
       completion_details = '{}'::jsonb
   where job_key = 'staging_e2e_bootstrap'
     and completed_at is null
     and expected_project_ref = 'abbeavtbifuddtrifvae';
   ```

3. Deploy `staging-e2e-bootstrap` to staging with `--no-verify-jwt`.
4. Invoke it with `x-sbp-maintenance-token` and an in-memory JSON body containing
   the generated `email` and `password` (minimum 16 characters).
5. Store those values directly as GitHub secrets; do not save the body/token.
6. Confirm the aggregate/ID-only response says `completed=true`; a second call
   must return 410. Replace `index.ts` with `disabled.ts` and redeploy.

Before creating the confirmed fixture, the function deletes only unconfirmed
Auth users whose `user_metadata.purpose` exactly equals
`steelbuild-pro-staging-e2e`. It never deletes confirmed or unmarked users. It
idempotently creates/resumes one synthetic org/project and owner memberships,
then completes the DB marker and clears its token hash.

## Exact GitHub configuration

| Kind | Name |
| --- | --- |
| Variable | `STAGING_E2E_ENABLED=true` |
| Variable | `STAGING_BASE_URL` |
| Secret | `STAGING_E2E_USER` |
| Secret | `STAGING_E2E_PASS` |
| Secret | `STAGING_E2E_SUPABASE_URL` |
| Secret | `STAGING_E2E_SUPABASE_ANON_KEY` |

Missing secrets fail the explicitly enabled job; there is no production
fallback.

The separate `steelbuild-pro-staging` Vercel project must store
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as encrypted, pullable
variables for Production and Preview. Do not mark them Sensitive: the GitHub
workflow runs `vercel pull` followed by an external prebuilt Vite build, and
Sensitive values export as `[SENSITIVE]` rather than usable browser config.

Mutation specs are excluded. Their separate job additionally requires
`STAGING_E2E_MUTATIONS_ENABLED=true`, a disposable-fixture declaration, and
separate `STAGING_E2E_FAB_*`, `STAGING_E2E_VIEWER_*`, or
`STAGING_E2E_PIECE_*` fixtures. Both specs reject non-staging targets. Leave the
mutation variable unset until disposable fixture reset/retention is approved.

Verified 2026-07-20: GitHub Actions run
[29801931119, attempt 2](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/29801931119/attempts/2)
passed the staging deploy, health check, and authenticated read-only
Drawings/Submittals/RFIs smoke.
