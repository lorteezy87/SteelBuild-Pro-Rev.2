# Automatable Backlog Execution Design

**Date:** 2026-07-22
**Status:** Approved for implementation planning
**Scope:** SteelBuild Pro engineering and owner-task backlog

## Goal

Continuously complete the highest-value SteelBuild Pro backlog work that can be performed safely through repository changes, CI, automated checks, and staging. Keep production mutations and genuinely human work behind explicit owner approval gates. Alternate reliability work with customer-workflow work so foundational risk and daily usability improve together.

## Decisions

- Use an alternating order: Reliability, then Workflow, then Reliability.
- Automate repository, CI, and staging changes.
- Require explicit owner approval before each production mutation.
- Keep each task in an independent, reviewable packet.
- Treat current repository evidence as authoritative; checklist text alone does not prove that an issue remains open.
- Keep owner-controlled completion steps in `docs/runbooks/owner-checklist.md` and engineering work in `docs/TODO.md`.

## Execution Lanes

### Reliability lane

Security, tenant isolation, backup and recovery, CI/testing, auditability, data integrity, observability, and performance work. Candidate tasks must be revalidated against current `origin/main` before selection.

### Workflow lane

Detailing, drawings, RFIs, submittals, piece control, fabrication, shipping, and field workflows. Work should answer a concrete operational question such as what is blocked, released, ready to ship, or ready to erect.

### Owner lane

Credentials, vendor accounts, production approvals, purchasing, legal and tax actions, policy decisions, and physical field verification. Automation may prepare scripts, instructions, validation queries, or staging evidence, but it may not claim these actions complete.

## Task Selection

At the start of each packet:

1. Fetch current repository refs and determine whether the working branch is behind `origin/main`.
2. Read repository instructions and active claims; avoid current file or domain overlap.
3. Inspect the mounted application path, current migrations, tests, and recent commits relevant to the candidate.
4. Skip entries already resolved by repository evidence.
5. Reject speculative bugs that cannot be reproduced or supported by concrete evidence.
6. Choose the highest-risk, smallest independently verifiable task in the required lane.
7. Move any credential, legal, production, or field dependency to the owner lane without blocking repository-safe work.

## Task Packet Lifecycle

Each task packet uses a clean worktree based on current `origin/main` and contains one cohesive change:

1. **Evidence:** record the open behavior, mounted path, affected business rule, and acceptance criteria.
2. **Claim check:** ensure no current agent claim overlaps the intended files or domain.
3. **Reproduction:** reproduce the defect or demonstrate the missing control when possible.
4. **Tests first:** add a failing test before behavior changes when the task is testable.
5. **Implementation:** make the smallest complete change using established repository patterns.
6. **Validation:** run focused checks and all proportionate repository gates.
7. **Runtime evidence:** use a browser or staging when it does not mutate production.
8. **Classification:** mark the result using one of the explicit states below.
9. **Tracking:** update the engineering TODO or owner checklist with evidence and remaining boundaries.

Task packets must not combine unrelated reliability and workflow changes merely to preserve the alternating schedule.

## Result States

- **Verified:** focused automated checks and every applicable staging or runtime check passed.
- **Code-ready:** implementation and local checks passed, but staging, credentials, or owner-controlled activation remain.
- **Owner-blocked:** completion requires credentials, purchasing, legal decisions, production approval, or physical field verification.
- **Skipped:** current evidence shows the item is resolved, speculative, obsolete, or already owned by an active overlapping effort.

A build-only result is never enough to label customer-visible behavior verified.

## Production Approval Gates

The agent must stop and request explicit approval before:

- applying a production database migration or RLS policy change;
- deploying or deleting a production edge function;
- changing production GitHub, Vercel, Supabase, Sentry, Stripe, DNS, auth, billing, or security settings;
- running destructive or irreversible production data operations; or
- enabling a feature broadly in production when a pilot or staged rollout is available.

Preparation is allowed before the gate: tests, migrations, dry runs, staged rehearsals, validation queries, deployment commands, rollback instructions, and owner-task documentation.

## Error Handling and Conflicts

- Do not convert timeouts, unavailable credentials, or missing staging into successful results.
- Report unrelated validation failures without expanding the task to fix them automatically.
- Preserve user and concurrent-agent changes; do not overwrite, revert, or force-push.
- If the branch is behind `origin/main`, reconcile before implementation and rerun relevant validation afterward.
- If an active claim overlaps the candidate, select another task or wait rather than editing around it unsafely.
- If production approval is declined or unavailable, retain the result as code-ready or owner-blocked and continue with the next repository-safe packet.

## Validation Standard

Run checks proportionate to the task:

- focused unit, integration, migration-contract, or component tests;
- ESLint and applicable TypeScript/JavaScript gates;
- production build for application changes;
- workflow/YAML or script syntax checks for CI and operations changes;
- staging migrations and rollback rehearsal for database changes;
- browser verification for mounted UI behavior when a safe authenticated environment exists; and
- `git diff --check`, secret review, and final status inspection for every packet.

Every handoff must state what was verified, not verified, and unable to verify.

## Initial Alternating Sequence

1. **Reliability:** reconcile and finish the existing Storage backup packet. Keep activation and the staging restore rehearsal in the owner lane until credentials and production approval are available.
2. **Workflow:** re-audit the mounted Detailing transmittal path and the existing transmittal branch against current `origin/main`. Implement only missing view, edit, delete, and persistence behavior, or mark the item resolved with evidence.
3. **Reliability:** revalidate the smallest repository-only enterprise item. Initial candidates are scoped cache invalidation, advisory coverage reporting, or edge-function type/test checks.
4. Continue alternating until the remaining tasks are owner-only, production-approval-gated, field-only, speculative, or already claimed.

The candidate list is intentionally not a fixed promise: current repository evidence and active work determine each selection.

## Acceptance Criteria

- The Storage activation and restore rehearsal remain visible in the owner checklist until proven.
- Reliability and workflow packets alternate without mixing unrelated changes.
- Each selected issue is revalidated against current code before implementation.
- Repository and staging work proceed automatically where safe.
- Every production mutation pauses for explicit approval.
- Each packet has focused validation and an honest result state.
- The program stops widening when only owner-controlled, speculative, field-only, or overlapping work remains.

## Non-Goals

- Automatically filing legal, tax, insurance, vendor-contract, or corporate-registration actions.
- Creating or exposing credentials on the owner's behalf.
- Treating staging evidence as proof that production changed.
- Automatically approving cost, schedule, contractual, compliance, or destructive business actions.
- Rewriting the entire historical backlog before doing concrete work.
