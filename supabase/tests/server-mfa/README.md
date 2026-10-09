# Server MFA verification

Run `npm ci --ignore-scripts` and `npm test` in this directory. The pinned
PGlite runtime executes the actual migration against an isolated PostgreSQL
fixture. Every impersonated request rolls back; no hosted Supabase connection
or real user/factor is used. The separate root Vitest tests are:

```text
npx vitest run supabase/functions/_shared/mfa.test.ts supabase/functions/_shared/mfaEntrypoints.test.ts
```

The SQL fixture proves that the pre-request assertion blocks an enrolled AAL1
caller before an otherwise callable SECURITY DEFINER RPC. Independent RLS checks
exercise Storage and a published table without the hook, including CRUD and
existing tenant permissions. AAL2, unenrolled/unverified-factor onboarding,
anonymous public access and service-role access retain their intended behavior.
Enrollment changes are read live, lookup errors fail closed, reapplication is
idempotent, and an existing sibling pre-request hook is never overwritten.

The Edge integration tests execute the actual seven handlers/auth functions via
TypeScript AST extraction with Auth and provider boundaries mocked. They verify
MFA denial after one trusted Auth lookup and before private reads or side effects.
These are local tests, not evidence of hosted HTTP enforcement or deployment.

## Reviewed rollout requirements

Candidate: `20261007073051_enforce_enrolled_mfa_at_server_boundaries.sql`.
No remote migration or Edge deployment has been performed by these tests.

1. Review both apps using this shared project's Auth. The request hook applies
   to all authenticated Data API requests, including existing SECURITY DEFINER
   RPCs and views. Anonymous/public and service-role callers bypass only the MFA
   check; their existing authentication/authorization rules remain in force.
2. Verify the active PostgREST configuration has no externally configured
   `db-pre-request`/`db-pre-config` hook. The migration rejects conflicts visible
   in PostgreSQL role/database/session configuration; external environment or
   config-file values also require inspection. Compose any existing guard
   explicitly instead of replacing it.
3. The `steelbuild_security` schema must remain outside Data API exposed schemas.
   Its definer helper accepts no user ID and returns only the caller's MFA result.
4. Apply the reviewed file manually in staging under the repository's migration
   procedure. Exercise real Auth-issued enrolled AAL1/AAL2 and unenrolled sessions
   through REST reads/writes, one definer RPC, private Storage download/upload/
   replacement/deletion, Realtime INSERT/UPDATE and the seven Edge endpoints.
   Test public signup and signed Stripe/email webhooks as well. Do not use
   `db push`, migration repair or MCP `apply_migration` on the shared project.
5. Apply/stamp the exact reviewed SQL using the repository contract only after
   owner authorization. Reloaded PostgREST configuration must actually select
   `steelbuild_security.check_request_mfa`; check an HTTP AAL1 request before
   declaring enforcement live. Deploy the seven guarded Edge functions together
   with their shared helper after the local, staging and Deno checks pass.
6. Run `readiness.sql` after application and whenever adding a Realtime table.
   The published-table policy covers the publication at migration time. Future
   additions need the same restrictive policy; readiness must return no gaps.

Existing Storage signed URLs are bearer capabilities until expiry; public bucket
reads are intentionally public. This change blocks protected authenticated
Storage operations, including creation of new signed URLs. Supabase Realtime's
DELETE notifications have their own platform semantics and cannot be treated as
proof that SELECT RLS filters every notification. Validate live subscriptions
and token refresh on staging. Direct trusted SQL administrators remain trusted;
the pre-request hook is a Data API boundary, not a blanket SQL connection policy.

Official references:
- https://supabase.com/docs/guides/auth/auth-mfa#enforce-rules-for-mfa-logins
- https://supabase.com/docs/guides/api/securing-your-api#pre-request-checks
- https://supabase.com/docs/guides/realtime/postgres-changes#delete-events-are-not-filterable
