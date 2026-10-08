# SteelBuild Pro security hardening

Assessment date: October 7, 2026, America/Phoenix. Catalog observations occurred on October 8 UTC.

## Scope and source

This assessment uses the actual `lorteezy87/SteelBuild-Pro-Rev.2` repository. The inspected starting commit is `1ce1d0a69f336218f94f8bf91d885e792235c0a6` on the existing `codex/steel-executive-hardening` branch. That branch already contains security changes awaiting release. The original checkout also contains unrelated drawing and application edits; they are excluded from this candidate.

The first corrections are implemented on `codex/security-membership-revocation`, in an isolated Git worktree. Production access in this assessment is read-only. No customer records were changed, no email or paid AI request was sent, and no database migration or application deployment was performed. The original checkout's uncommitted work remains separate.

This is a source audit, targeted regression work, and a read-only production configuration check. It is not a penetration-test certification or a claim that every security issue has been eliminated.

## Verified baseline

- The current production catalog has row-level security enabled on all 143 public tables checked, with zero disabled.
- All four observed Storage buckets are private. This does not establish adequate project-level authorization or immediate revocation of existing signed URLs.
- Production contains the same stale-membership role helper and privileged project-archive function used to reproduce finding S-01 below.
- The planned `steelbuild_security` MFA functions and authenticator request hook are absent from production. Existing repository documentation records a separate staged MFA/erasure release; that historical staging record is not a fresh staging test.
- A fresh production-dependency audit reports zero known advisories. The complete dependency tree reports five high entries inherited from one unresolved Braces advisory through Tailwind build tooling. No exceptions were added and no audit gate was weakened.
- Supabase advisors returned seven informational deny-by-default tables, one public-schema extension warning (`pg_net`), and 153 authenticated-callable security-definer function warnings. These are review candidates, not 153 confirmed exploits. Legitimate RPCs must retain their intended permissions.

## Findings and first correction package

### S-01 — Removed company member retains privileged project authority — P1

Removing an organization membership leaves explicit `user_projects` records. Ordinary project reads correctly reject the removed member, but three role resolvers can still trust those records. The security-definer `soft_delete_project` function relies on the minimum-role helper, allowing a removed project administrator with a valid session to archive the project.

Evidence: `supabase/migrations/20260819001000_org_member_default_project_access.sql`, the baseline exact-role helper, `20260914120000_adopt_production_soft_delete_project.sql`, and the current production function definitions. An isolated PostgreSQL-compatible reproduction showed ordinary project access denied while the privileged archive still succeeded.

Correction: require current membership in the project's company for explicit project roles in `get_my_project_role`, `user_has_project_role`, and `user_has_project_role_at_least`. Preserve current role precedence and authorized administration of archived projects. Do not delete historical project-membership records or rewrite previously applied migrations.

Candidate: `supabase/migrations/20261008032524_require_current_workspace_membership_for_project_roles.sql`, generated with the Supabase CLI. This file has not been applied to a hosted database. Its manifest entry is explicitly `required` and `PENDING PRODUCTION APPLY`; a regression confirms that the drift gate still reports it missing. The 36-check SQL suite now runs inside the existing required CI job, so a failure blocks publishers.

This change preserves historical project grants. If a person is added back to the same company, those grants become effective again. Removing historical grants on offboarding would be a separate policy change. Already-running PostgreSQL statement snapshots are not retroactively revoked.

### S-02 — Outbound email trusts surviving project roles — P1

The email handler separately resolves a project role with a service-role client and returns an explicit project role before checking current company membership. A removed PM can therefore reach provider dispatch. Archived projects also miss the normal access boundary. The reproduction executes the real handler against controlled, offline transport/provider doubles; it sends no real email.

Correction: verify active project access and the PM role floor through canonical RPCs using the caller's exact bearer token before privileged mailbox reads, quota checks, or provider operations. Both RPCs must return the exact boolean `true`. Denials return 403; failed, malformed or unavailable lookups return 503 before sending. Company-default PMs and current company administrators continue to work. Tests execute the real handler, including successful dispatch with mocked providers.

Authorization and an external provider send are separate operations; this does not guarantee cancellation of a send already in flight during revocation, or idempotent delivery of retried authorized requests. The live function's deployed source was not retrieved, so this finding is verified against the inspected source rather than asserted as a live provider exploit.

### S-03 — Delayed closeout mutation restores previous company data — P2

An optimistic closeout update stores a snapshot under a project-only query key. A late failure can restore that snapshot after sign-out or company switching has cleared the shared cache. The enabled Closeout module's portfolio key can collide between identities. The initial reproduction uses the application's rollback pattern and a real query client, without hosted requests.

Correction: bind mutation work and every cache/UI completion to the initiating workspace generation, project selection and component lifetime. Reject stale optimistic writes and suppress stale rollback, success, and invalidation callbacks. Preserve ordinary same-workspace rollback. Eleven tests exercise the real page, child form/checklist, QueryClient and notification system; only the external entity API and project selector are mocked.

This guards the component's callbacks and pre-call checks. It does not cancel a network write already started or pin the shared client's token throughout transport; server authorization remains essential.

## Remaining hardening work

| Priority | Work | Required acceptance |
|---|---|---|
| P1 | Release the already prepared server MFA protections together with compatible clients/functions | Enrolled AAL1 is denied and AAL2 succeeds on REST, RPC, private Storage, protected Realtime and user-facing Edge endpoints; onboarding and signed webhooks continue to work |
| P1 | Stage and release the membership/email correction | Removed viewer/field/PM/admin/owner cannot use stale project records; authorized users and archived-project administration still work; email denial occurs before provider dispatch |
| P1 | Define project-confidential Storage access | A member of company A without access to project X cannot download X's files; migration accounts for current organization-prefixed object paths and historical references |
| P1 | Isolate deployment credentials and enforce release controls | Production credentials exist only in restricted deployment environments; preview credentials are separately scoped; required checks cannot be bypassed by the normal contributor path |
| P2 | Make email/AI quotas server-owned and atomic | Editing or deleting correspondence cannot reset quota; concurrent reservations, retries, provider success and persistence failure have explicit accounting behavior |
| P2 | Establish mailbox ownership independently of editable settings | Adding an address to `email_accounts` cannot authorize use of another company's mailbox; verify provider-side grants and domain/mailbox binding |
| P2 | Scope calculator history and other local records | Shared-browser account/company switching cannot show previous calculation rates, material rows or crane snapshots; ownerless historical data requires explicit recovery |
| P2 | Extend async completion isolation | Audit remaining optimistic rollback paths, including drawings, submittals and schedule mutations; coordinate with their active owners |
| P2 | Remove private targeting data from flag responses | Client-readable feature flags expose only the caller's effective settings, not cross-company user override maps |
| P2 | Restrict new privileged function defaults | A newly created privileged helper is not automatically available to application roles; explicit grants preserve intended RPCs |
| P2 | Reject oversized unauthenticated handoff/read bodies while streaming | Requests exceeding the limit stop before the whole body is buffered; test boundary and chunked requests |
| Release readiness | Resolve Braces/Tailwind toolchain advisory | Adopt a supported patched dependency chain or a separately tested framework migration; do not use blanket overrides or suppress the finding |
| Operational | Backups, restore, monitoring and incident response | Restore database and private files into a disposable environment; verify alert delivery, audit retention, credential rotation and account-offboarding procedures |

These are sequenced follow-up work, not completed controls. Mailbox impact depends on provider-side application grants, which were not inspected. Backup recoverability, live branch protection and deployment-credential placement were not verified in this pass. Other agents have active claims on the drawing, submittal and schedule areas; this candidate does not overwrite their work.

## Company modes and security model

Fabrication-only, erection-only and combined mode selection is a product configuration, separate from company membership and user permissions. Hiding navigation cannot be the authorization boundary.

When module configuration is implemented, require server-side checks for enabled company capabilities and project scope, composed with existing organization/project membership and role rules. Maintain an explicit policy for authorized historical reads after disabling a module. Erection-only supplier/delivery records must remain usable without exposing a supplier's private fabrication records. Sharing between separate companies requires explicit, scoped grants; a supplier relationship alone grants no access.

Acceptance should cover two companies, two projects per company, enabled/disabled modules, viewer/field/PM/admin roles, removed users, archived projects, direct RPC/API calls, export/download paths and offline replay. Test direct requests independently of visible menus.

## Verification and release status

Negative tests first reproduced the defects: membership checks initially had 18 failures, outbound email had 15, and closeout isolation had seven. Final focused verification passes 36 SQL checks and 57 tests across email authorization, closeout isolation, migration classification and workflow validation. These groups are separate; the Vitest checks also belong to the full suite.

ESLint, TypeScript, JavaScript typecheck, strict-null and implicit-any ratchets, no-new-JavaScript check, Deno 2.9.6 email entrypoint checking, and the production build pass. Existing grandfathered TypeScript diagnostics remain on their unchanged shrink-only lists. The build retains its existing large-chunk warnings. Build values were non-secret CI placeholders, so the generated bundle is not a deployment artifact.

Independent reviews covered the SQL semantics, email boundary, closeout callbacks and release-gate wiring. Review caught and corrected an initial CI wiring gap: the SQL checks now execute inside required `ci`, rather than as an independent advisory job.

The complete final Vitest run passed **7,966 tests across 815 files**, exit 0. The isolated SQL package separately passed **36 checks**, exit 0, after a clean dependency install. These are local checks; hosted staging/production acceptance and GitHub release checks are not represented as complete. The production drift gate must continue to block until required migrations are reviewed, applied and stamped.

Hosted release requires the repository's existing reviewed-backend process. Preserve source bundles and gateway JWT modes, review exact SQL and ledger stamps, verify staging with synthetic accounts, then obtain authorization for the named production changes. This database is shared with another application. Never run `supabase db push`, migration repair, or silently modify the production ownership manifest to dismiss pending work.

## References

- [Supabase product security](https://supabase.com/docs/guides/security/product-security)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Authenticated security-definer advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Public-schema extension advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
- [RLS enabled without policies: deliberate deny-by-default review](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
- [Braces advisory: no patched release listed at inspection](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [OWASP Application Security Verification Standard](https://owasp.org/projects/asvs)

Repository evidence also includes `AGENTS.md`, `CLAUDE.md`, `docs/runbooks/reviewed-backend-release.md`, `docs/audits/BACKEND_RELEASE_CANDIDATE_2026-10-07.md`, `docs/audits/STAGING_ACCEPTANCE_2026-10-07.md`, and `docs/audits/DEPENDENCY_TOOLCHAIN_2026-10-07.md`. Historical release statements are distinguished from the fresh checks above.
