# Staging setup and operation

Last reviewed: 2026-09-21. Vercel staging and Supabase abbeavtbifuddtrifvae are retired.

| Component | Current staging target |
| --- | --- |
| Supabase persistent branch | ndyfjffsulfbwpmwdmic (parent kjrwqagyeswwoxpjkcko) |
| Supabase URL | https://ndyfjffsulfbwpmwdmic.supabase.co |
| Cloudflare Worker | steelbuild-pro-staging |
| Frontend | https://steelbuild-pro-staging.n-lortz1987.workers.dev |
| Deploy config | wrangler.staging.jsonc (no production routes) |
| Git branch | staging |

The owner approved Supabase's $0.01344/hour quote before creation: approximately $9.81 per 730-hour month, plus metered usage. See [Supabase branching billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Database readiness

The branch was created persistent and without production data. Automatic replay stopped after migration 20260712141821. The production ledger is shared with sibling applications and is not a replayable baseline for a new branch.

The empty staging database was recovered from a current schema-only pg_dump of public/private. The first restore rolled back because platform-owned supabase_admin default privileges cannot be changed by postgres. The successful atomic restore left those platform-owned defaults alone and preserved the application table/function grants, policies and triggers. Auth profile creation and all five Storage policies were restored. No production Auth users, customer rows, stored objects, secrets or scheduled jobs were copied.

Source dump SHA-256: 134d9aac061b8c3b7d9627505eccc707f6f1ac935cb8cf7486fcd51b8ea67653.
Before new migrations, parity was 140 public tables, 140 RLS tables, 393 policies and 352 functions. All public function definitions matched exactly (combined MD5 ac446bb3130e1fd6cf5a5ec3b1d67729).

Migrations 20260921054458 and 20260921055027 were then tested, applied and stamped with their exact SQL on staging. Following explicit owner approval and final checks, they were also applied and stamped atomically in production on 2026-09-21; see docs/claude-issue-review-2026-09-21.md for hashes and verification. Supabase's historical branch-workflow label may still display MIGRATIONS_FAILED for the original replay; it is not proof of the manually restored schema's readiness. Do not claim that automatic branch replay is fixed.

**Never run db push, migration repair, branch merge or unreviewed replay against production.** Do not connect automatic Git migration replay to this manually recovered branch. Recreating it currently requires a reviewed schema-only restore and parity checks.

## Synthetic fixture and secrets

Run scripts/seed-staging.mjs with STAGING_SUPABASE_URL, STAGING_SERVICE_ROLE_KEY, STAGING_ANON_KEY and a random STAGING_E2E_PASS of at least 24 characters. The script rejects every project except ndyfjffsulfbwpmwdmic. Credentials must come from a secret store, never source code.

The synthetic account is staging.pm@steelbuild-pro.invalid. The fixture includes Example Fabrication (staging), STG-0001, three drawing sheets and one drawing set/submittal. The later disposable fab-gate fixture adds a separate clean set, a fourth sheet, a second submittal and a viewer account; both submittals follow the normal review/checklist transition to IFC. A synthetic PDF is uploaded under the staging organization/project path. It uses Auth admin creation, normal authenticated RPCs and atomic numbering. Both storage buckets are private; app-files is 50 MiB with the configured MIME allowlist and email-attachments is 25 MiB.

GitHub Actions secrets: STAGING_E2E_USER, STAGING_E2E_PASS, STAGING_E2E_SUPABASE_URL and STAGING_E2E_SUPABASE_ANON_KEY. The service-role key is not needed by the frontend or read-only E2E jobs. The fixture password has been stored in the repository's encrypted secrets.

Auth settings are in supabase/config.staging.toml. Copy that file to a temporary directory's supabase/config.toml, review config diff, then config push with that workdir and the explicit staging ref. This avoids applying unrelated CLI defaults. Auth redirects target the staging frontend, email confirmation stays enabled, and OTP length is eight.

project-export is deployed with JWT verification. Its ALLOWED_ORIGINS setting explicitly includes the staging frontend and local development origins. Other external integrations are not automatically enabled or copied from production.

## CI deployment and browser checks

deploy-staging-cloudflare runs after ci, secret-scan and edge-typecheck, only on a push to staging with STAGING_ENABLED=true. It is bound to GitHub's `staging` Environment, so its Cloudflare and browser-build secrets must be configured there rather than as repository secrets. It builds from staging-only Supabase secrets, verifies the exact project URL and separate Worker name, deploys with wrangler.staging.jsonc, then checks the staging URL.

The read-only and disposable-mutation E2E jobs both depend on that deploy and retain explicit staging-branch/push gates. E2E rejects the production app host and production database even if the expected project ref is misconfigured.

Set STAGING_BASE_URL to the frontend above. Enable STAGING_E2E_ENABLED only after fixture secrets and the staging deployment exist. STAGING_E2E_MUTATIONS_ENABLED is enabled after provisioning the disposable fab-gate fixtures. Full Piece Control lifecycle fixtures remain disabled; the basic direct-table-denial check is configured.

Read-only browser verification passed in [staging CI run 35569765272](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/35569765272): four navigation tests and two authentication/sign-out tests. The same run passed all 6,744 unit tests and 18 desktop/mobile shell-recovery checks, then deployed the isolated Worker. A real project-export request returned all 96 table sections, while inaccessible-project and unauthenticated requests returned 403 and 401.

The fabrication-release server was also exercised using real staging user JWTs: blocked RFI refused, admin override recorded and snapshotted, clean separate set released, viewer denied. CI run 35571242322 also passed the four fab-gate checks and one Piece Control direct-write denial. Three separate Piece Control lifecycle/cross-tenant fixtures are intentionally skipped. The final export implementation preserves production v2 row-file references and canonical piece/GC records, pages project calendars and note-folder descendants, and passes a Deno type check.

## Database regression tests

Run supabase/tests/pending_issue_permissions.sql with psql and ON_ERROR_STOP against staging. It includes the two candidate migrations, uses synthetic rows, enables normal triggers/RLS for assertions, and rolls everything back. It checks authorization, atomic numbering and date aliases, including unknown dates and clearing.

## Rollout and rollback

The #460 migrations (`20260921054458`, `20260921055027`) were approved, applied and stamped together in production on September 21; their ledger payload hashes match the committed SQL. #460 then passed production CI at `4837dd6bb` and deployed successfully. They are no longer pending.

The separate launch-security migration `20260921080604` was owner-approved and applied/stamped in production and staging on September 21. Its ledger payload matches committed SQL MD5 `cdf1be475b4c306ac1fa12c336f9d769`. The boundary suite and exact release package both passed rollback rehearsals before application. The boundary suite includes the migration and is intended for the pre-migration baseline, not an already migrated database. Follow [the reviewed backend release runbook](reviewed-backend-release.md) for rollout evidence and remaining workflow setup.

To reverse the access-policy change, restore the field-role INSERT policy and original field-role RPC guard. To reverse date synchronization, remove trg_sync_rfi_date_aliases and sync_rfi_date_aliases(); do not erase valid copied dates. Rehearse reversals on staging first.

For frontend rollback, deploy a previously validated commit to the staging Worker. The production Worker and routes are separate.
