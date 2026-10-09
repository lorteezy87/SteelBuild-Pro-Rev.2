# Atomic Drawing Set Revision Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement each tested slice. Root approved source-only execution; adapters and hosted promotion remain separate.

**Goal:** A reviewed set revision commits its header, roster, current revisions and supported coordination together or leaves all unchanged.

**Architecture:** A new uninstalled PostgreSQL command accepts an explicit complete roster and exact versions. A private actor/request/payload receipt makes retries deterministic. Existing captured source attributes and approval records remain unchanged; internal carried-zone edges are mapped, unsupported topology rejects the request.

**Tech Stack:** PostgreSQL, typed Node test runners, PGlite for fast behaviors, actual PostgreSQL for concurrency.

**Spec:** `docs/audits/DRAWING_UPLOAD_HISTORY_TRANSACTION_2026-10-09.md`.

## Constraints and review focus

- Candidate outside migrations; quarantine and installed SQL unchanged; no hosted writes.
- No product/shared-helper edits or old-client/direct-REST enforcement in this slice.
- Existing four RED UI regressions stay unmerged until a typed adapter is implemented.
- Explicit org/project PM and enrolled-MFA checks before and after waits, even receipt retries.
- Unsupported cross-sheet/deleted/foreign dependency topology rejects the whole request.
- Test lost responses, differing payload retries, all partial-write injection points, archived or reparented sources, Storage changes and access revocation.
- Avoid row-lock cycles: request advisory lock first (no data locks held), then NOWAIT parent/child/Storage locks with retryable contention; runtime lock timeout bounds implicit FK/trigger waits.

## Work

- [x] Build a dedicated fixture from committed schema plus exact manifest guards; reproduce missing command before SQL and validation/topology failures while implementing.
- [x] Implement private receipts, strict request validation, complete roster/version checks and atomic received-revision/header changes.
- [x] Add deterministic zone/link/internal-dependency mapping, reject unsupported topology, retain original coordination rows and source snapshots.
- [ ] Verify behavioral rejection/rollback at revision, zone, link, dependency, parent, header and receipt writes under actual PostgreSQL.
- [ ] Exercise independent concurrent identical/different requests, request-wait permission revocation, row contention and erasure order; measure stated input/coordination bounds.
- [ ] Add isolated PostgreSQL CI workflow, independent review and exact source evidence; keep candidate uninstalled.
