# Real synthetic PDF evidence acceptance

Status: source prepared; no hosted execution or production readiness claim.

The manual `synthetic-pdf-acceptance.yml` workflow builds an exact main-ancestor
commit after that SHA passes the app, secret, Edge and commercial PostgreSQL
jobs together. Only its protected `staging-backend` job receives the existing
encrypted staging E2E credentials. It never creates an account or API key.

## Scope and contracts

- Fixed target: staging `ndyfjffsulfbwpmwdmic`; project `STG-0001` in
  `Example Fabrication (staging)`, validated by exact IDs, names and membership.
- Each manual run/attempt derives a fresh, explicitly synthetic set, sheet,
  Shop Drawing Draft, two revisions and four workflow receipt IDs. Occupied
  IDs or Storage paths fail before mutation. The read-only Draft and legacy
  untyped fixtures remain unchanged.
- Two deterministic, valid one-page PDFs say `SYNTHETIC - NOT FOR CONSTRUCTION`.
  PDF.js independently parses both in unit tests. Authenticated Storage upload
  uses real bytes, `upsert:false` and exact org-scoped paths. Downloaded SHA-256
  values must match before a revision is registered.
- This exercises normal authenticated REST creation and the existing
  `publish_drawing_revision(..., 'reviewed')` and
  `apply_submittal_round_workflow` RPCs. It is **API write + rendered read
  acceptance**, not proof of the upload wizard or every interactive review editor.
- Revision A is submitted with the current execution date and synthetic EOR
  routing. A synthetic internal approval to GC includes all four OFS checks on
  the known fixture. No external EOR approval, transmittal, email or engineering
  certification is represented. The records and source PDF are clearly synthetic.
- Register/detail/matrix are checked at 1440px and 390px. Coverage must verify
  A exactly. The revision remains `reviewed`, so the test does not invent shop
  distribution or claim overall fabrication release.
- Publishing B atomically changes the current revision. Captured A must stay
  immutable, coverage must become stale, another approval attempt must fail,
  and the canonical fabrication gate must include revision-manifest mismatch.

## Boundaries

Browser routing is installed at context level before navigation, blocks service
workers and WebSockets, and permits only known local/staging reads and font
resources. Allowed HTTP requests cannot follow redirects. Edge functions,
provider origins, payments, email, invitations and project archival mutations are
not permitted. Separate Node API transport validates complete reserved-ID write
templates and exact PDF bytes, rejects redirects, and caps requests/time.

The runner uses explicit reloads; it does not prove realtime subscription/cache
convergence. No tracing, video, auth state, API payloads or raw error logs are
retained. Artifacts are allowlisted screenshots and sanitized result/evidence
JSON with run identity, phase, counts and synthetic PDF hashes/byte counts.

## Cleanup and interruption

The `finally` path uses the normal atomic Void transition and archives only the
new submittal, sheet and set. It verifies no active rows among those three,
compares all existing fixture-row fingerprints, and verifies retained source
bytes again. Review rounds, immutable revision evidence, revision history and
both PDF source objects remain retained and counted. Normal audit/activity
records remain. The shared project and previous fixtures are never archived.

A failed or canceled job is not proof of cleanup. Inspect the exact Actions
run/attempt (IDs and storage paths are deterministic) and the sanitized evidence
artifact. If cleanup is incomplete, inspect those reserved objects before any
manual follow-up; do not broaden permissions or delete immutable history. A
retry uses a new attempt identifier and does not overwrite prior sources.

## Required evidence before claiming success

Local policy, executed workflow-gate, PDF parser and real browser redirect/popup
tests are source verification only. Hosted acceptance additionally requires the
main-only job to finish successfully with both approval and stale-state UI
screenshots, verified source hashes, unchanged existing-row fingerprints and
explicit retained-history/zero-active-parent counts. Production acceptance,
upload-wizard interaction and optional provider integrations remain separate.

## Source verification (2026-10-09)

- 65 focused Vitest cases passed: scoped mutations, public-key rejection,
  complete workflow source gates, PDF parsing and shared browser policy.
- 10 real loopback browser contracts passed across desktop/mobile: redirected
  and direct external requests, first popup requests and WebSockets never reach
  the denied server; permitted local assets remain readable.
- Strict standalone TypeScript passed for the runner, helpers, config and
  focused tests. Applicable scoped lint and `git diff --check` passed.
- Test discovery finds exactly one protected synthetic workflow scenario.
- Independent reviews checked SQL lifecycle/archive contracts and network,
  billing/email, credential and artifact boundaries. The retained-source check
  refuses a missing previously uploaded PDF and requires exact successful-run
  counts: two PDFs/revisions, one review round/evidence row and three archived
  parent records. Captured evidence must match its submitted snapshot.

These checks did not authenticate to staging or create hosted records. The
shared browser guard is `e2e/stagingNetworkGuard.ts`; this runner retains its
separate strict API mutation policy in `e2e/synthetic-pdf/guard.ts`.
