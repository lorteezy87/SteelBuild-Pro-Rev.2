# Explicit submittal type contract — 2026-10-09

An authenticated staging read found an Approved legacy submittal with
`submittal_type = NULL`, ball-in-court GC, no submission date, no current round
and no revision evidence. Some new client readers interpreted NULL as Shop
Drawing, while both the canonical drawing eligibility helper and SQL require
the explicit `Shop Drawing` value. Inferring that value in SQL would change
which historical records can govern drawing approval. The correction belongs
in client interpretation; this follow-up preserves the server contract as tests.

## Scope and invariants

Only regression coverage and this audit change. No migration, policy, function,
production record or hosted fixture was changed by this follow-up.

The installed staging migration remains
`20261009070300_submittal_round_revision_evidence.sql`, SHA-256
`b4b77581e51a0c61ee63d47fa34d1010a123bb1759bee6889e0ca0ec719b0ea7`.
Its source was independently exercised at frozen PR511 head
`e299a6be3e3a2788ce2bc65d1abbda8bd1d51319`; the committed tests are based on
release integration head `690b48edd4da1c13fb31608a62325fe8aa744d36`.

`get_submittal_revision_coverage` reports `ok: false` and
`reason: not_shop_drawing` for NULL. `evaluate_fab_release_set` excludes it
from governing approvals. This is not a missing-manifest Shop Drawing and
must not be presented as one or offered a legacy drawing attestation.

A pre-transmission Draft with no round or evidence may be explicitly
classified. An Approved legacy record cannot become Shop Drawing in place,
including a simultaneous change to Draft. Create a new explicitly typed Draft
when that historical classification must be corrected; do not silently infer
the type, the submission date, or the recipient.

## Reproducible checks

Eleven scenarios were added to the existing
`supabase/tests/submittal-revision-evidence/cases.ts` harness. Each uses an
isolated rollback transaction and the same baseline table constraints and
existing workflow guards as the other revision-evidence tests.

| Scenario | Expected result |
| --- | --- |
| NULL / Approved / GC / no round or date | Coverage false, `not_shop_drawing`, no evidence |
| NULL Approved → Shop Drawing | `ROUND_EVIDENCE_IMMUTABLE` |
| NULL Approved → Shop Drawing and Draft together | `ROUND_EVIDENCE_IMMUTABLE` |
| PM attempts legacy attestation for the NULL approval | `ROUND_ATTESTATION_REQUIRED` |
| NULL Draft → explicit Shop Drawing before first transmission | Allowed; coverage remains inactive |
| Newly classified Shop Draft → Submitted by direct update | `ROUND_WORKFLOW_REQUIRED` |
| Pre-transmission Shop Draft → Product Data | Allowed; no drawing approval evidence |
| NULL and Product Data coexist with a typed governing package | Typed package remains the governing record |
| Blank or unknown type | Baseline type CHECK rejects the write |
| Released Shop Drawing history → NULL type | `ROUND_EVIDENCE_IMMUTABLE` |
| Only NULL or Product Data links exist for a drawing set | No governing submittal, release false, `no_submittal` blocker |

The local PGlite run passed all **38** behavioral checks (27 existing + 11
new). The existing `commercial-postgres` CI command runs the same cases in
actual PostgreSQL, then the existing 18 independent-session concurrency
scenarios. Exact-head CI evidence is pending at this source commit; a local
PGlite pass is not hosted PostgreSQL or production-release evidence.

No NULL-type fabrication-release bypass was reproduced. The first interpretation
of this finding as a database evidence bypass was withdrawn after tracing and
executing the canonical strict-type contract.
