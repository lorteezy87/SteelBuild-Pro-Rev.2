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
- Existing Storage authorization remains unchanged; possessing a reservation
  is not yet a server-enforced Storage requirement or an enterprise-readiness claim.

## Verification

Pending red/green behavioral and independent-session PostgreSQL verification.
