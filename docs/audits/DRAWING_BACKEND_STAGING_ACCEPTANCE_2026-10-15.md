# Drawing backend staging acceptance — incomplete

This is a source-only safety-harness checkpoint, not a hosted acceptance result.
No fixture credentials, authenticated requests, SQL installation/activation,
fixture setup, workflow dispatch, deployment or production mutation was performed
by the Task 13 source implementer. The four migration payloads remain unchanged.

## Implemented source boundary

The new CLI requires staging, exact ref `ndyfjffsulfbwpmwdmic`, full candidate SHA,
an independently reviewed manifest digest and an explicit private manifest. It
refuses unknown/missing arguments, dirty/different source, wrong origins, privileged
API keys, malformed/expired/unbound fixtures and missing synthetic actors. The
public key digest must match the independently reviewed fixture; an opaque key
prefix alone is not project proof.
Only `preflight` and `acceptance` exist; neither installs SQL or provisions accounts.

The manifest binds two organizations/four projects, seven distinct synthetic actors,
known drawing entities and source objects. Names or purpose metadata confer no
authority. Before a permitted mutation the transport rereads the exact parent
through its independently authenticated creator and compares id/org/creator.
It also rereads each exact referenced entity and verifies its project binding.
This verifies these bindings, not every lifecycle relationship or role;
those remaining requirements are listed below. All app clients still use user JWTs.

The finite network policy permits bounded fixture reads, protected-field rejection
probes and the original fab-gate operations. Production/provider/email/unknown
requests and redirects refuse locally. Declared foreign/removed actors may send
known-fixture negative probes; those are counted as forwarded only after the actual
server reply. The protected-write case distinguishes explicit 401/403 from a
200 empty RETURNING result, and requires exact target existence and complete-row
observer equality. A local refusal cannot satisfy that server-denial case.
Browser routing and opt-in Node Supabase fixture clients share this boundary.

The dedicated Playwright configuration uses only the separate loopback preview at
`127.0.0.1:4173`, no reused server, no service workers, traces, HAR, videos or
screenshots. Its reporter discards raw errors, logs, titles and attachments and
requires every named case; missing/skipped cases produce INCOMPLETE and nonzero.
The default production smoke configuration excludes the new drawing spec.

The new workflow requires manual main dispatch, a main-ancestor exact candidate,
the existing four non-drift source jobs passing together, and the unchanged
main-only staging-backend environment policy. A separate build job validates
the fixed staging public configuration, records source/file hashes, and uploads
an immutable artifact. The evidence job downloads that artifact ID and rechecks
its bytes before consuming actor/manifest secrets. No privileged setup key is
injected. Dependencies are installed without hooks before actor credentials exist
in the step environment. Only sanitized JSON paths are eligible for evidence upload.

## Current execution status and deliberate stops

The CLI currently performs authenticated identity/parent preflight when explicitly
authorized with real fixtures, then returns INCOMPLETE/nonzero for the unresolved
catalog, installation, MFA, command/lifecycle, recovery/erasure and advisor gates.
Consequently the checked-in workflow stops before its browser command. It must not
be treated as a ready full acceptance workflow or dispatched to obtain a green run.
The dedicated browser command can run its implemented subset under the same
bindings, but its reporter still cannot return PASS for the incomplete matrix.

| Requirement | Source status | Next concrete work |
| --- | --- | --- |
| Exact target/source, credential/manifest binding, no provider spend | Implemented and tested offline | Independent source review before credentials |
| Auth identity and fresh parent checks | Implemented; no hosted run | Owner-provided reviewed actors/manifest and exact staging authorization |
| Real protected-field negative probes with snapshot equality | Implemented in dedicated spec; no hosted run | Validate actual roles and independent synthetic provenance before execution |
| Existing four-case fab gate | Original spec retained; guarded Node wiring and skip rejection implemented | Provide reviewed distinct clean/blocked drawings, PM/viewer bindings; execute original spec |
| Both upload UIs / create and revise commands | Not implemented in this checkpoint | Fixed reviewed command payload schemas, uploaded-byte/source binding, real UI selectors and init read roster; no generic command JSON allowance |
| Lost response/reload and two-tab retry | Not implemented | Real-forward/commit-confirm/response-hide sequencing after command bindings |
| Role/org/project and removed-membership matrix | Protected-column probe alone is insufficient | Verify membership/role state; exact removal lifecycle and full command denials |
| MFA AAL1/AAL2 | Not implemented | Owner-created enrolled actor/factor and independently reviewed challenge/verify transport |
| Storage upload/upsert/replace/move/delete, physical PDF/page readback | Not implemented | Exact synthetic PDF bytes/hash/page fixtures and bounded Storage operations |
| Metadata/calibration, holds/locks, rounds/coverage and exports | Not implemented | Named scoped operations and authoritative before/after assertions |
| Scanned/manual/AI-unavailable UI intake | Not implemented | Real manual intake and pre-provider rejection; no llm-proxy invocation |
| Rollback rehearsal / installed package / activation | Manual operator prerequisites | Separate exact-target reviewed SQL and full ownership/dependency closure |
| Safe stop, direct RPC/UI denial, recovery and disposable erasure | Not implemented | Reviewed staged operations, same-instance hashes and unrelated-fixture counts |
| Before/after advisors | Before baseline supplied by root only | Compare after actual permitted staging work; never auto-dismiss findings |

The new staging SQL file is a manual catalog-only transaction ending in ROLLBACK.
It asserts explicit stage/source/classification/fixture bindings and reads installed
fingerprints, ledger payload hashes and effective mutation privileges. It is not the
required synthetic write rehearsal, stop/unstop implementation or install wrapper.
Use the separately reviewed four-payload installer and same-instance capture/activation
process only after root reconciles exact target, classifications and authority.

## Root-supplied read-only baseline, 2026-10-16

Root refreshed the branch mapping and exact-stage catalog/advisors separately from
the unfinished harness: stage PG17.6, 433 functions, 14 tables, 362 columns,
52 policies, 42 triggers; anon statement deadline 3s, authenticated/authenticator 8s,
authenticator lock deadline 8s and MFA hook present. Security advisor groups were
11 informational RLS-without-policy, 98 authenticated-definer warnings and one
leaked-password-protection warning. These are review candidates, not confirmed
vulnerabilities or authority to alter shared controls.

Root's separate production SELECT-only catalog had 445 functions, 14 tables,
362 columns, 57 policies and 42 triggers. Of the 433 shared function definitions,
only `extensions.grant_pg_net_access()` differed between environments; 12 definitions
were production-only. Both environments individually matched their retained prior
function-definition snapshots. This is a scoped hash comparison, not complete
parity, caller/ownership/dependency closure, independent database-origin proof or
activation approval. No baseline was rerun by this implementer.

## Verification scope

Offline tests exercise actual validator/dispatcher behavior with an instrumented
final network boundary, including positive forwarding controls. Mocked transport
responses prove guard behavior only and are never hosted authorization evidence.
Actual RED/GREEN, static and full-suite results are recorded in the implementation
report. Hosted results remain absent. Production remains read-only and the four
unapplied versions must continue blocking production drift.
