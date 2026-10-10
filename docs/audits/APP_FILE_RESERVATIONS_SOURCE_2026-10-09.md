# Project upload reservation source candidate

Status: database candidate verified, uninstalled additive source only. No Storage policies,
objects, existing references, legacy mapping, or production classification change.

Root authorized the private model and reservation subset of the
[file boundary plan](../superpowers/plans/2026-10-09-app-files-project-boundary.md).
The full file-access defect remains open until the coordinated policy/client
candidate and legacy census acceptance are complete.

## Scope decisions

- Only project reservations are enabled. The RPC requires the exact scope
  `{kind:'project',orgId,projectId}`; explicit workspace identity catches wrong
  context before any receipt is created. The future client must capture both
  IDs, rather than deriving the active workspace after awaiting a request.
- Branding/avatar scopes are rejected pending producer and permission review.
- No existing path can be submitted or adopted. A reservation allocates a fresh
  server-generated UUID path and retains the actor/request receipt.
- The binding stores a monotone write-role floor. This slice exposes no adoption
  API or entity-reference triggers; reviewed adoption must raise the floor
  atomically before the later Storage-policy cutover.
- SQL stays in `supabase/candidates/`, outside every migration/deployment glob.
  It has no migration version or ledger stamp. Generate the release migration
  only when the complete candidate and classification are reviewed.
- Ordinary authenticated and service-role callers have no private table or
  helper grants. Database-owner maintenance remains privileged and is not
  constrained by the claim that application callers cannot forge bindings.
- The seven named workflow profiles preserve current extension allowlists;
  the implicit client `default` profile is not accepted by this new API. This
  adds no paid capability restrictions, and existing upload callers are unchanged.
- Existing Storage authorization remains unchanged; possessing a reservation
  is not yet a server-enforced Storage requirement or an enterprise-readiness claim.

## Verification

The authorized-reservation assertion failed against the absent API. Corrected
source `b6c99b4659a18b6ccd44c5572a86739d2f63e322` passes 39 behavioral checks in
both PGlite and actual PostgreSQL 17, plus 16 independent PostgreSQL concurrency
scenarios in [job 113870134696](https://github.com/lorteezy87/SteelBuild-Pro-Rev.2/actions/runs/37945337206/job/113870134696).
The fixture includes the real organization-membership guard instead of assuming
cascades take no parent locks. Focused strict TypeScript and lint also pass.
No hosted SQL has been executed for this candidate.

The frozen SQL SHA256 is
`49e6dfbaf748f7d4091c394bd74553f91440c78f17be7d0e07ff24484bdcf6a7`.
This is a source hash, not an installed migration or ledger-payload hash.

The independent review confirmed the Auth-erasure lock order as a concrete
case requiring a bounded retry: membership deletion takes an organization lock
after Auth owns the user row. The candidate must not wait on that Auth row while
holding the organization. The dedicated real PostgreSQL regression failed on
`ade377f335b750a4638454a5536481ada51d4923`, job `113868627233`, with a lock timeout
instead of the required retryable error. The correction uses Auth key-share
`NOWAIT` and returns `FILE_RESERVATION_BUSY` / SQLSTATE `55P03`, rolling back the
reservation. The corrected regression observes the immediate retryable error,
then executes Auth deletion with its actual membership cascade successfully.

The remaining concurrent cases cover four identical requests producing one
receipt; changed-payload and cross-workspace conflicts; membership, project grant,
PM role, archive, MFA enrollment and Auth identity changes during parent waits;
default-role refresh; permission, role, MFA and raised-floor changes during an
existing-receipt wait; and rejection of a pinned REPEATABLE READ snapshot. Each
uses independent backend sessions and checks the persisted receipt outcome.

The existing Storage policies, object metadata and project rows are compared before and
immediately after applying the candidate in each disposable harness. Tests also
prove that forged document references grant no reservation rights, even a
service role with BYPASSRLS lacks private metadata privileges, and Auth erasure
anonymizes receipts while retaining object metadata rows. These are model and
permission checks; there is no Storage HTTP upload, byte-retention verification
or hosted client acceptance in this slice.

The full app-files implementation plan still has open work: legacy inventory
and reviewed mapping, ordinary object mutation/retention policy, source adoption,
client routing, exports, and coordinated Storage-policy acceptance. This slice
does not close any of those findings or establish enterprise readiness.
