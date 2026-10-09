# Release acceptance fixture freshness

The production acceptance job consumes the canonical lifecycle and exception-release work packages. Those packages cannot be reused: the database refuses a second canonical release. `scripts/seed-staging.mjs` creates a reusable navigation fixture only; it does not provision these release fixtures. The retired bootstrap function is not a replacement.

**Current release blocker:** an operator must supply fresh, reviewed synthetic fixtures in `ndyfjffsulfbwpmwdmic` for each workflow attempt. Automated fixture provisioning/reset is not implemented or verified. The preflight fails closed before deployment, then repeats immediately before the mutation tests. It does not create, reset, release, or delete project records.

The protected `steelbuild-staging` environment must provide the existing `STAGING_E2E_*` fixture IDs and credentials, plus `STAGING_E2E_RELEASE_FIXTURE_ATTESTATION`. That secret contains this JSON shape, with real reviewed values substituted:

```json
{
  "schema": 1,
  "supabase_ref": "ndyfjffsulfbwpmwdmic",
  "revision": "<exact 40-character GITHUB_SHA>",
  "run_id": "<GITHUB_RUN_ID>",
  "run_attempt": "<GITHUB_RUN_ATTEMPT>",
  "disposition": "fresh-for-single-release-attempt",
  "reviewed_by": "<responsible operator>",
  "prepared_at": "<UTC ISO timestamp>",
  "expires_at": "<UTC ISO timestamp, at most 24 hours after preparation>",
  "fixture_ids": {
    "E2E_FAB_PROJECT_ID": "<uuid>",
    "E2E_BLOCKED_DRAWING_ID": "<uuid>",
    "E2E_CLEAN_DRAWING_ID": "<uuid>",
    "E2E_PIECE_PROJECT_ID": "<uuid>",
    "E2E_PIECE_OTHER_TENANT_PROJECT_ID": "<uuid>",
    "E2E_PIECE_WORK_PACKAGE_ID": "<uuid>",
    "E2E_PIECE_APPROVED_DRAWING_ID": "<uuid>",
    "E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID": "<uuid>"
  }
}
```

Bind the attestation to the queued workflow's exact revision, run ID and attempt before allowing its protected environment job to start. A rerun requires a new attestation and a freshness review; a partially consumed attempt needs new work packages, not a new label on the old ones. Actual environment protection and secret configuration remain hosted acceptance requirements.

The primary user must read the fab and Piece Control projects in one synthetic workspace. The second identity must have viewer access to the fab project and read a separate workspace's canonical-piece fixture. This proves the foreign project and row exist before asserting that the primary identity cannot read them. Both identities must be distinct. No service-role credential is required.

The preflight verifies exact configured ID bindings and active project/drawing/work-package relationships. The lifecycle package must have no actionable canonical pieces yet. The exception package must have canonical scope and a genuine drawing, material or hold blocker. Both packages must report `already_released=false` through the authoritative `evaluate_release_gate` RPC. Missing or unknown evidence fails. The mutation suite still proves release behavior; preflight is not a substitute.

Project checks use authenticated GETs and the stable, read-only release-gate RPC. The script signs in to obtain temporary sessions and attempts local sign-out afterward. Credentials, tokens and server bodies are never printed; successful output contains only revision/run metadata and aggregate verification counts. No hosted checks were executed while developing this guard. Unit tests mock the transport and prove rejection behavior; they do not certify live fixture readiness.

The attestation records operator review; it is not server-issued proof of synthetic provenance. An authorized fixture provisioning contract, per-run retention/cleanup, live reviewer/environment configuration and a successful hosted acceptance run remain required before claiming automated repeatability.
