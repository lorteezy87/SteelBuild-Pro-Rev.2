# Project upload reservation source candidate

Status: in progress, uninstalled additive source only. No Storage policies,
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

The authorized-reservation assertion failed against the absent API. The initial
candidate passes 39 isolated SQL checks, focused strict TypeScript and lint.
Actual PostgreSQL verification remains in progress; its fixture now includes
the real organization-membership guard instead of assuming cascades take no
parent locks. No hosted SQL has been executed for this candidate.

The independent review confirmed the Auth-erasure lock order as a concrete
case requiring a bounded retry: membership deletion takes an organization lock
after Auth owns the user row. The candidate must not wait on that Auth row while
holding the organization. The dedicated real PostgreSQL regression failed on
`ade377f335b750a4638454a5536481ada51d4923`, job `113868627233`, with a lock timeout
instead of the required retryable error. The correction uses Auth key-share
`NOWAIT` and returns `FILE_RESERVATION_BUSY` / SQLSTATE `55P03`, rolling back the
reservation. Verification of the corrected full concurrent suite is pending.

The full app-files implementation plan still has open work: legacy inventory
and reviewed mapping, ordinary object mutation/retention policy, source adoption,
client routing, exports, and coordinated Storage-policy acceptance. This slice
does not close any of those findings or establish enterprise readiness.
