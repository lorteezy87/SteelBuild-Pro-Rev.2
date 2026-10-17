# Drawing backend staging acceptance — incomplete

## Parent Task 13 command/receipt source prerequisite — no transport admission

The production result parser and strict committed/pending/not_committed receipt
parser now share the pure `src/lib/drawingCommands/responses.ts` module. The
application adapter keeps its existing exported result parser and uses these
same functions. Actual failing UUID regressions reproduced PostgreSQL-normalized
UUID false rejection, alternate-case duplicate drawing/revision acceptance and
prior-revision reuse. Comparison keys now canonicalize only schema-validated
UUID identities; reviewed/returned spelling, Storage namespace, notes, tokens,
roster order, counts and hash-format validation stay intact. No JavaScript
PostgreSQL JSONB hash calculation or hash-correctness claim is made.

The new pure `e2e/drawingCutoverCommandTransport.ts` revalidates the complete
existing three-slot intake book, recognizes only exact PM/A1 create/revise/receipt
POST envelopes, preserves exact payload/scalar/array identity and freezes detached
bindings. It proposes at most 502 exact GETs for the parent project, returned set
and changed drawing/revision pairs only after direct success or a committed
receipt passes the production parser. Pending/not_committed cannot create a
readback plan or authorize retry. Complete supplied observations must match every
exact path, contain exactly one strict projected row and preserve all required
parent/source/page/live/current/received relationships.

The project projection is the actual generated `projects.id,org_id` contract.
There is no `projects.created_by` column in the generated schema. Foundation
`createdBy` records creation-session provenance and separately observed owner
membership; this pure validator cannot certify a database creator. The existing
live network guard's `created_by` parent expectation is a concrete outstanding
ownership/admission defect requiring a separate reviewed correction before any
live unlock. That unclaimed guard and all setup/CLI/readiness stops are unchanged.

These are proposed requests and supplied-content checks, not authentic transport,
ownership, authorization, immutable PDF/page-byte, source-token, JSONB-hash,
same/removed-sheet-effect or topology proof. Returned IDs never enter the fixture
manifest/registry, grant later writes or become ordinary network-guard authority.
Local tests exercise real pure functions and unchanged guard refusal; no local
guard throw is SQL rejection evidence. Exact-source CI, independently reviewed
runner/ownership admission, the pending UI request-admission design and full
authenticated staging acceptance remain required. No fixture creation, private
approval-state change, hosted request, SQL, deployment or production write was
performed by this source prerequisite.

Local verification for this bounded source passed 331 focused tests, all six
static gates and covering lint. One production build exited 0 (52.02 seconds),
with mixed static/dynamic-import and large-chunk warnings. The ONE complete full
application test run exited 1: 917 files passed and two failed; 9,610 tests passed
and three failed. The inert-asset bundle case returned a null child-process
status; the loaded-script bundle case and official-record-number assignment
safeguard each reported a 5,000 ms timeout. Causes remain unproved. These full
suite failures remain open; no timeout increase, test weakening or full-suite
retry was performed. The source commit is a bounded review candidate requiring
fresh independent review and exact-head CI, not Task 13, staging or release
completion. All live readiness/admission stops remain closed.

## Parent Task 13 CI integration repair — source verification only

The isolated SQL helper now imports the root setup contracts as types only, so
Node 24 erases that dependency instead of loading the root Zod installation.
Its synthetic stage/ordered actor bindings are compared with the actual shared
constants in root Vitest. Root tests also run the real setup-plan and foundation
receipt validators against the SQL helper's valid inputs and the exact same 46
malformed template fixtures that the SQL runner independently refuses. The
original 59 other entitlement checks, refreshed hashes, full refusal snapshots,
outer rollback and shared-role checks remain in place. No SQL, package, lockfile,
workflow, runtime validator or readiness guard changed.

Local verification passed all 84 focused root staging tests on Node 24.11.0 /
Windows, including the existing Windows-only recovery case. A separate owned
TEMP snapshot, with only the nested locked dependencies installed and no root
or ancestor Zod, reproduced the pre-fix import failure and then passed all 105
entitlement checks plus all 234 prior drawing checks. Those local disposable
results establish package independence and preserved assertions, not hosted
PostgreSQL concurrency or staging acceptance.

Gitleaks 8.24.3 was acquired from its official release and its Windows archive
SHA256 matched that release's checksum manifest before execution. Its inherited
`generic-api-key` detector now has one rule-specific AND exception for the entire
public RFC 6238 Appendix B SHA-1 vector in exactly
`scripts/__tests__/drawingCutoverStaging.test.ts`. The existing global allowlist
and other default rules remain intact. Actual-binary controls proved that a
different synthetic credential in that path, the public vector outside that
path, and another default rule in the same path still produce findings. The
reviewed first-parent/no-merges history range lost exactly its four known benign
findings. No finding values or fingerprints are included in this evidence.

This bounded repair does not establish hosted PostgreSQL 17 concurrency, a full
exact-source CI pass or authenticated staging acceptance. The earlier Windows
full-suite aggregate crash remains unresolved by these focused checks. Parent
Task 13 and all real readiness stops remain incomplete; root must obtain fresh
exact-SHA dedicated and required PostgreSQL jobs and full CI after independent
source review. No hosted settings, credentials, accounts, SQL, dispatch or
deployment were used by this repair.

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
The evidence CLI supports `preflight` and `acceptance`; neither installs SQL or
provisions accounts. Separate guarded foundation phases are described below.

The manifest binds two organizations/four projects, seven distinct synthetic actors,
known drawing entities and source objects. Names or purpose metadata confer no
authority. The existing underlying mutation validation attempts to reread the
exact parent through its creation-session actor and compare id/org/created_by.
The generated projects schema has no created_by column, so this expectation
cannot establish the claimed parent/creator proof and needs the separately
reviewed ownership/admission repair described above before live use. It also
describes exact referenced-entity project checks; those checks alone do not prove
every lifecycle relationship or role. All app clients still use user JWTs.

The finite classifier recognizes bounded fixture reads, protected-field rejection
probes and the original fab-gate operations. A shared final prerequisite gate now
refuses ALL mutations because a reviewed readiness verifier does not yet exist.
Neither environment flags nor manifest assertions can unlock it. Production/provider/email/unknown
requests and redirects refuse locally. Declared foreign/removed actors may send
known-fixture negative probes in the underlying classifier; they cannot currently
cross the readiness gate. When separately authorized source work implements actual
readiness, forwarding may be counted only after the actual server reply. The
protected-write case distinguishes explicit 401/403 from a
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
its bytes before consuming actor/manifest secrets. The seal parses the actual
emitted Vite configuration object, binds source/URL/public-key digests and refuses
missing, nonliteral or ambiguous configuration. Verification recomputes those
bindings from the hashed bytes and compares the runtime key, then the entry point
compares the reviewed manifest before authentication. Browser/Node adapters reject
missing or different supplied apikey headers rather than replacing a bad key.
No plaintext key is added to seal metadata or evidence. No privileged setup key is
injected into build/evidence/browser processes. Dependencies install without hooks before actor credentials exist
in the step environment. Only sanitized JSON paths are eligible for evidence upload.

## Current execution status and deliberate stops

The CLI currently performs authenticated identity/parent preflight when explicitly
authorized with real fixtures, then returns INCOMPLETE/nonzero for the unresolved
catalog, installation, MFA, command/lifecycle, recovery/erasure and advisor gates.
Consequently the checked-in workflow stops before its browser command. It must not
be treated as a ready full acceptance workflow or dispatched to obtain a green run.
The dedicated browser command now refuses before authentication, browser launch or
mutation enablement. The acceptance runtime and shared final mutation transport
also enforce this stop, independently of the workflow exit and final reporter.
The implemented subset is not currently runnable for hosted writes.

| Requirement | Source status | Next concrete work |
| --- | --- | --- |
| Exact target/source, emitted build/key and client-key binding, no provider spend | Implemented and tested offline; R1 fixes await re-review | Independent source review before credentials |
| Auth identity and fresh parent checks | Implemented; no hosted run | Owner-provided reviewed actors/manifest and exact staging authorization |
| Real protected-field negative probes with snapshot equality | Implemented in dedicated spec; no hosted run | Validate actual roles and independent synthetic provenance before execution |
| Existing four-case fab gate | Original spec retained; guarded Node wiring and skip rejection implemented | Provide reviewed distinct clean/blocked drawings, PM/viewer bindings; execute original spec |
| Both upload UIs / create and revise commands | Finite intake input bindings implemented; transport/UI scenarios remain unimplemented | Uploaded-byte/source readback, exact live roster, finite forwarding and real UI selectors |
| Lost response/reload and two-tab retry | Not implemented | Real-forward/commit-confirm/response-hide sequencing after command bindings |
| Role/org/project and removed-membership matrix | Protected-column probe alone is insufficient | Verify membership/role state; exact removal lifecycle and full command denials |
| MFA AAL1/AAL2 | Not implemented | Owner-created enrolled actor/factor and independently reviewed challenge/verify transport |
| Storage upload/upsert/replace/move/delete, physical PDF/page readback | Not implemented | Exact synthetic PDF bytes/hash/page fixtures and bounded Storage operations |
| Metadata/calibration, holds/locks, rounds/coverage and exports | Not implemented | Named scoped operations and authoritative before/after assertions |
| Scanned/manual/AI-unavailable UI intake | Manual command input requires added sheets, known positive pages and unavailable text/callouts; UI scenario remains unimplemented | Real manual intake and pre-provider rejection; no llm-proxy invocation |
| Rollback rehearsal / installed package / activation | Manual operator prerequisites | Separate exact-target reviewed SQL and full ownership/dependency closure |
| Safe stop, direct RPC/UI denial, recovery and disposable erasure | Not implemented | Reviewed staged operations, same-instance hashes and unrelated-fixture counts |
| Before/after advisors | Before baseline supplied by root only | Compare after actual permitted staging work; never auto-dismiss findings |

The new staging SQL file is a manual catalog-only transaction ending in ROLLBACK.
It asserts explicit stage/source/classification/fixture bindings and reads installed
fingerprints, ledger payload hashes and effective mutation privileges. It is not the
required synthetic write rehearsal, stop/unstop implementation or install wrapper.
Use the separately reviewed four-payload installer and same-instance capture/activation
process only after root reconciles exact target, classifications and authority.

## Parent Task 13 slice A: finite intake bindings (source only)

The optional acceptance `FixtureManifest.intakeBindings` field is one strict
version-1 book: `projects` has exactly `A1`, `A2`, `B1`, `B2`, each with its declared
`id`, `orgId`, `createdBy`; `commands` has exactly `newSet`, `revision`,
`manualIntake`, each with a distinct stable UUID `requestId`, `actor: pm`, the
matching `create_set`/`revise_set` operation and complete production `payload`.
The actual application request builders validate the payloads; no copied business
parser or generic command forwarding was added. The minimal import/constructor
compatibility changes let these existing builders run under Node 24 type stripping.

Both A projects belong to the PM/admin organization and were created by the
declared admin; both B projects belong to and were created by the declared foreign
actor. Every alias must match its manifest identity, and all three plans explicitly
target A1. The existing `drawing:preflight` selects validated A1 while retaining the
PM caller and independent admin/foreign parent observers. Array order, names and
PM-created-project inference cannot select it. Legacy CLI preflight manifests may
still omit the book, but scenario selection refuses missing/null/ambiguous bindings.
This does not promote legacy manifests to acceptance or change phase reporting.

The pure boundary checks distinct request IDs and synthetic E2E new-set names,
same-project declared set/drawing/revision identities, exact Storage paths, page
bounds and consistent metadata tokens for repeated source paths. Manual intake
cannot claim harvested-empty text/callouts. Unknown keys, substituted actors/actions,
non-JSON input and conflicting identities refuse with sanitized errors. Returned
books and requests are detached from caller objects and deeply frozen. Literal
request strings retain their reviewed values. The separately reviewed full raw
manifest fingerprint remains the approval boundary; the book creates no new digest
or approval channel. SQL metadata tokens and PDF content hashes remain distinct.

These checks do not establish the active database roster, set-to-drawing/history
relationships, current timestamps, token existence, name availability, actual PDF
bytes/pages or engineering approval. All need later authenticated readback. The
three unconditional real setup, acceptance and mutation stops remain unchanged.
No new browser scenario, transport route, workflow, setup schema or SQL changed;
the sixteen remaining scenarios and full Task 13 hosted acceptance are incomplete.

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

R1 is focused verification only. The previous 9,371-test/916-file full suite and
build/budget belong to source checkpoint 0c42e5c89, not proof of the later fix SHA.
Owner has approved the automated-setup choice and reports that the dedicated
`STAGING_DRAWING_SETUP_SECRET_KEY` is stored only in `staging-backend`. That is
owner-reported storage, not independently verified availability, exact-project
binding or permission to use its value. Separate setup source review, secure
handoff and execution remain absent; this does not open the source-only readiness
gate.

## Task 4 foundation handoff: source only, 2026-10-16

Hosted acceptance remains **INCOMPLETE**. The workflow now describes separate
`setup-bootstrap` and `setup-complete` jobs, but its secret-free verifier always
refuses setup with `SETUP_PREREQUISITES_UNPROVED` before any environment job.
The real CLI and every real setup mutation transport also retain their
unconditional readiness stops. Manual approval, matching fingerprints and a
passing source test cannot unlock them. No real keys, private inputs, settings,
main integration, dispatch, SQL, Auth operation or deployment were used for this
source change. Parent Task 13, all sixteen missing drawing scenarios and the
original four fab cases remain required; foundation receipts prove no acceptance.

The checked-in source requires manual `main` dispatch, a reviewed ancestor and
the same exact-SHA push run containing all four required source jobs. Setup
attempts must be `1`, including partial-job reruns. Setup dispatch carries only
`candidate_sha` and `phase`; a nonempty fixture digest, legacy setup digest or
unknown input is refused. Preflight/acceptance still require their fixture digest.
Build/evidence/browser processes have no setup inputs or broad setup key.
Bootstrap has no resume-secret binding; complete alone receives its resume.
Only the finite server step receives the dedicated setup key. Tooling installs
without hooks before private inputs are injected; concurrency remains serialized.

Later operator sequence, only after reviewed readiness permits execution:

1. Complete source review/readiness, exact main/SHA/four-source-job gates,
   immutable same-source build and public-key seal, compatible installed package
   and provenance, maintenance/classification, side effects, health and no-email
   closure. No accounts should be created while known scenario source is missing.
2. Independently read the effective `lorteezy87/SteelBuild-Pro-Rev.2` →
   `staging-backend` policy and establish the separately approved owner reviewer
   `lorteezy87`, administrator bypass OFF, owner self-review allowed and sole
   branch `main`. Preserve unrelated settings. All other environment jobs,
   including build/evidence, require manual approval too. Source tests do not
   establish effective policy or prove a waiting job's secret-read timing.
3. After its required build, hold the selected setup job at its separate manual
   approval. Independently review the actual repository, workflow, execution run,
   attempt, candidate, phase, campaign and recipient. Privately finalize the exact
   compact documents and separately approve their complete UTF-8 fingerprints.
   The owner saves `STAGING_DRAWING_SETUP_PLAN` and
   `STAGING_DRAWING_SETUP_PLAN_SHA256` as **environment secrets**; complete also
   needs `STAGING_DRAWING_SETUP_RESUME` and
   `STAGING_DRAWING_SETUP_RESUME_SHA256`. Keep each pair fixed through startup,
   then approve that job. No automatic secret writer is provided.
4. Independently inspect metadata to establish those exact secret names originate
   in the environment and have no repository/organization fallback. Matching
   values and YAML `secrets.NAME` references cannot establish origin. A later
   authorized same-source run must prove that the job waits before obtaining
   environment secrets and reads the owner-entered post-creation values when it
   starts. No synthetic hosted rehearsal may bypass current readiness stops.
5. Validate raw full-byte fingerprints, actual execution context, expiry,
   recipient and prerequisites before creating private 0700/0600 input files.
   Each raw document must fit 48,000 UTF-8 bytes; no normalization before hashing,
   truncation, fragments or alternate channel. The separate 1 MiB private recovery
   bound remains in force. Prepare writes the initial encrypted file; upload only
   that fixed file with one-day retention. Independently cross-check the upload
   action's immutable ID/archive digest against repository/run metadata and the
   local ciphertext-file digest before any server execution. Archive and
   ciphertext hashes identify different bytes and must remain distinct.
6. Download the exact immutable final artifact by independently pinned ID, verify
   its repository/workflow/run/attempt/candidate and archive digest, extract only
   `final.enc.json`, verify that file's separate ciphertext digest, and decrypt
   privately with the dedicated local custody key and its original context/AAD.
   Review the actual terminal receipt, journal, identities, census and recoverable
   MFA state. The final file is create-new and binds the factory's terminal
   receipt to the latest valid private checkpoint; a result checkpoint is not a
   terminal success artifact. Missing persistence/upload, interruption or
   cancellation remains incomplete/uncertain. Never retry account creation,
   relabel a context, reset credentials, adopt existing accounts or clean up
   unknown rows/PDFs. Reconcile `UNKNOWN_COMMIT_STATE` independently.

Canonical owner resume construction uses the original compact bootstrap plan
once, its reviewed final recovery receipt and seven generated 43-character
base64url passwords with the exact reviewed emails. A successful bootstrap has
sixteen operations/thirty-two journal records, seven authenticated actors, two
organizations and two owner memberships, no projects, no MFA and an empty child
census. The source-derived estimator serializes these shapes plus every resume,
context, artifact, receipt-review and two-entitlement wrapper, reserving 20-digit
decimal IDs, 36-byte UUIDs and full hashes. It counts UTF-8 and JSON escaping of
the actual copied plan/emails. Census, owner review and two entitlement readback
timestamps in this recipe use `Date.toISOString()` with a four-digit UTC year
(24 bytes). This bounds this construction recipe, not schema-unrestricted
timestamp/password widths. Bootstrap admission proves that future recipe fits
before any write; complete independently checks its actual complete raw input.

After bootstrap, the owner independently verifies the exact newly created two
organization identities/creators and side effects before the separate reviewed
manual entitlement fragment changes only those receipt-bound rows from `free` to
`pro`. Retain its exact readback and provenance. Complete uses a new reviewed plan
for its new execution and independently pins the original bootstrap artifact,
receipt and original decryption context. An expired plan requires fresh review
and live readback, not account recreation. MFA enrollment/notification requires
named action-time owner authority and reviewed restoration/closeout; generated
TOTP secrets and credentials remain in private encrypted recovery only. No setup
key, deployment PAT or local private key may enter recovery. This source change
does not apply entitlements, configure policy or claim PostgreSQL/runtime proof.
