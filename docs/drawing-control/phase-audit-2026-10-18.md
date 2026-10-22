# Drawing control and submittal tracking — phase audit and build record (2026-10-18)

Branch `feat/drawing-control-phase1`, from `main` at `b16e4b7`.

This record maps the owner's Muse Code master prompt (Phases 1–6) and the
Phase 1 drawing-control prompt against what Rev. 2 actually contains, then
records what this branch built. Each line names its evidence. **Reuse** means
the capability exists and was not touched. **Extend** means this branch added
to an existing module. **New** means this branch added it. **Proposed** means
it is written up but not built, with the reason. **Blocked** means a recorded
prerequisite must land first.

Nothing on this branch is applied to staging or production. No migration was
added to `supabase/migrations/`; the one database change is an uninstalled
candidate under `supabase/candidates/`.

## 1. Where the prompts conflict with the repository

| Prompt says | Repository says | Followed |
|---|---|---|
| Fix the `numberSequencing.jsx` race first | Fixed in `c5612168`; `noInventedRecordNumbers.test.ts` gates it app-wide (CLAUDE.md) | Repository. No change. |
| Design: 2px radius, Space Grotesk headings | Dual theme, Barlow Condensed / Inter / IBM Plex Mono; "do not reintroduce a fake 2px-only rule" (CLAUDE.md) | Repository. |
| Hosting: Cloudflare Workers | Production is ChatGPT Sites; Workers is staging/preview (CLAUDE.md) | Repository. No deploy. |
| New migrations per task | A repo migration missing from the production ledger fails `supabase-drift` on every branch (`scripts/supabase-drift-check.mjs:293-296`); unreviewed SQL lives in `supabase/candidates/` | Repository. Candidate only. |
| Transition rules as configurable per-project data | Transition graph is plpgsql (`enforce_submittal_status_transition`, `20260725190000`); behaviour switches are global `feature_flags` | Proposed only (§4). |
| Ball in court may name the fabricator | "S&H Steel does not belong in this product's logic"; `src/lib/ballInCourt.ts` is the vocabulary | Repository. New code uses only canonical parties. |

## 2. Phase-by-phase gap map

### Phase 1 — Architecture and core foundation

| Item | Status | Evidence |
|---|---|---|
| Atomic record numbering | Reuse | `get_next_sequence_number` (baseline B:825); `numberSequencing.jsx` RPC-only |
| Revision / workflow status / disposition / release as separate fields | Reuse | `drawing_revisions` (revision, `release_status`), `submittals.status`, `submittal_rounds.status`, `submittal_sheet_responses`, `fab_release_log` |
| Server-enforced submittal transitions | Reuse | `enforce_submittal_status_transition()`; `apply_submittal_round_workflow` RPC with PM/MFA, idempotency, optimistic concurrency (`20261009070300`) |
| Resubmission preserves prior cycles | Reuse | `submittal_rounds`, `guard_submittal_workflow` forbids round deletion; `submittal_round_revision_evidence` immutable by trigger |
| Release readiness gate + audited override | Reuse | `evaluate_fab_release_set`, `enforce_fab_release_gate` (`20261008041759`), `fab_release_log` insert-only |
| Override offered only to authorised roles | **Extend** | `ExportFabReleaseModal.jsx` now hides the override below PM (server already refused it) |
| Immutable audit for every state change | **New (candidate)** | `supabase/candidates/append-only-activity-audit.sql` — see §3.3 |
| Why / Waiting on / Who on packages and submittals | **New** | `WhyWaitingWhoPanel.tsx` — see §3.2 |
| Saved register views | **New** | `SavedViewsControl.tsx` — see §3.4 |
| Server-side drawing-sheet stage transitions | Proposed | §4.2 |
| Construction release separate from fabrication release | Proposed | §4.1 |
| Cross-org RLS tests | Reuse | `membership-revocation`, `app-files-project-boundary`, `submittal-revision-evidence` harnesses |

### Phase 2 — Drawing management

| Item | Status | Evidence |
|---|---|---|
| Upload, sheet detection, title-block read | Reuse | `pdfSheetExtractor.ts`, `pdfTitleblockText.js`, `src/lib/docControl/*` |
| Revision control, supersede | Reuse | `drawing_revisions`, `publish_drawing_revision`, `crossSetSupersede.ts` |
| Virtualized drawing register | Reuse | `DrawingRegisterGridPanel.tsx`, `drawingRegisterTable.tsx` |
| Drawing viewer | Reuse | `DrawingViewer.jsx`, `GcDrawingViewer.tsx` |

### Phase 3 — Submittal management

| Item | Status | Evidence |
|---|---|---|
| Register, rounds, dispositions, reviewer routing | Reuse | `Submittals.tsx`, `SubmittalDetail.tsx`, `approvalChains`, `NewRoundModal.jsx` |
| Review forecast and cycle time | Reuse | `submittalForecast.ts`, `CycleTimeCard.jsx` |
| Delay against the contract review period, 7/14/21 escalation, delay-log export | **New** | `reviewDelayLedger.ts`, `ReviewDelayCard.tsx` — see §3.1 |
| Notifications | Reuse | `submittalAgingTriggers.ts` (ActionItems); user notification preferences |

### Phase 4 — Construction coordination

| Item | Status | Evidence |
|---|---|---|
| Drawing ↔ submittal ↔ RFI ↔ release links | Reuse | `submittals.drawing_set_ids`, `linked_rfi_ids`, `gc_issuance_shop_set_impact_links` |
| Work packages, piece control, fab release | Reuse | `release_work_package_canonical`, `PieceRegister` |
| Schedule link | Reuse | Gantt/CPM module (`src/lib/schedule/*`) |
| 48-hour / 10-day lookahead | Reuse | Command Center execution brief (`docs/roadmaps/STEELBUILD_INTELLIGENCE.md`) |

### Phase 5 — Advanced document intelligence

| Item | Status | Evidence |
|---|---|---|
| Revision comparison | Reuse | `RevisionCompareModal.jsx`, `rasterCompare.ts`, comparison RPCs |
| AI revision impact | Reuse | `revisionSnapshotDiff.js` via `llm-proxy` |
| Cited question-and-answer over project documents | **Blocked** | Roadmap requires an atomic spend reservation before new model execution ("the existing gateway's aggregate usage counter is not a concurrency-safe spend reservation") |

### Phase 6 — Enterprise operations

| Item | Status | Evidence |
|---|---|---|
| Transmittals and distribution | Reuse | `TransmittalLogPanel.tsx`, `generateTransmittal.js` |
| Field offline replay | Reuse | identity-safe outbox (Field Today) |
| Reports and exports | Reuse | report destinations inventory (`FULL_APP_REBUILD_INVENTORY_2026-10-07.md`) |
| Procore / ACC / P6 integrations | Blocked | Each connector must be "operationally verified or clearly identified as unavailable" (rebuild roadmap). No credentials or provider work in scope. |

## 3. Built on this branch

### 3.1 Approval delay log — `src/lib/reviewDelayLedger.ts`, `src/components/submittals/ReviewDelayCard.tsx`

- Each review round is measured from its sent date against the project's review period `detailing_lead_days.approval`. It reads the same value as `submittalWorkdayDue.ts`: the drawing-set setting first, then the project setting, then the default.
- The hub's working-day setting sets the unit (working or calendar days), so due dates match the rest of the Approvals tab.
- Escalation steps are 7, 14 and 21 calendar days past due, ending at a written delay notice.
- **Reviewer roll-up:** rounds, late, out and late, total days over, average days held, worst overrun.
- **CSV export:** one row per round, with the unit in the headers. Formula injection is neutralised.
- **Unknowns are kept out of totals:**
  - a round with no sent date
  - a dispositioned round with no return date
  - a return date earlier than the sent date

  These are counted as "unmeasured", never as on time. Submittal-level dates are used only for a submittal with no round log.
- Rendered on the Approvals (matrix) tab.

### 3.2 Why / Waiting on / Who — `src/components/shared/WhyWaitingWhoPanel.tsx`

- **Why it moved:** the last change to a tracked field, from the server row audit that `audit_log_trigger()` writes for submittals, drawings, drawing sets, revisions and RFIs (`src/lib/recordMovement.ts`).
  - The read lives in `src/api/client/recordAudit.ts`.
  - The table is named `pma_audit_logs`. That is a legacy name: it is the generic audit sink, not the retired assistant. It is deliberately not registered in `entities.ts`, where `pmaRemoval.test.ts` keeps the retired assistant's identifiers out.
- **Waiting on, on a submittal:** the current stage, required returned comments not yet resolved (through the canonical comment gate), and the submittal's own open linked RFIs (`submittalWaitingOn.ts`). Linked RFIs come from the `uuid[]` column and are never pooled with the drawing text column.
- **Waiting on, on a drawing set:** the `evaluate_fab_release_set` blockers grouped by the party that clears them (`setGateBlockerOwnership.ts`). The raw blockers already appear in the same panel.
- **Who:** the recorded ball in court, the reviewer, the next workflow move and the due date.
- Failed reads say "unavailable". A missing ball in court says so instead of guessing.

### 3.3 Append-only activity and audit — `supabase/candidates/append-only-activity-audit.sql`

**What the candidate removes** (verified holes in the repo lineage):
- the member UPDATE and DELETE policies on `drawing_activity` and `submittal_activity`
- the member INSERT policy on `pma_audit_logs`, which let any project member forge audit rows
- UPDATE, DELETE and TRUNCATE grants for application roles

**What stays unchanged:** reads, activity inserts, owner-run erasure and FK cascades. The file also fails closed if a read policy is missing.

**Harness:** `supabase/tests/append-only-activity` runs in the `ci` job. It builds the tables from the committed definitions and replays their committed policy history. It then proves each hole exists before the candidate and is closed after it.

**Not applied or stamped anywhere.** Release follows `docs/runbooks/reviewed-backend-release.md`.

### 3.4 Saved register views — `src/lib/savedRegisterViews.ts`, `src/components/shared/SavedViewsControl.tsx`

- Named filter sets are saved on the drawing register (search, set, status, grouping) and the submittal register (status, ball in court, search).
- They are stored on this device, per signed-in user. User preferences were not used because they live in auth `user_metadata`, which travels in every access token.
- If a saved value is not valid on the current project, it falls back to All.

### 3.5 Fab-release override authority — `src/components/drawings/ExportFabReleaseModal.jsx`

- Below PM role, the modal now explains that only a project PM can override. Before this change, field and viewer users could fill in an override that the server would refuse.

## 4. Proposed, not built

### 4.1 Construction release as its own record

**Today:** fabrication release is `fab_release_log`. "Released for Erection" is only a manual `drawing_sets.detailing_state`, and revision distribution (`released_for_field`) is explicitly not an authorization.

**Proposal:** a `construction_release_log` that mirrors `fab_release_log`:
- insert-only
- PM floor
- an override reason
- a gate that requires a prior fabrication release for the same sheets, no active holds and a current distributed revision

This is a new shared-database table, so the owner has to decide it first (CLAUDE.md, sibling-app rule).

### 4.2 Server-side sheet-stage guard

`drawings.stage` changes are checked only in the browser (`validateStageTransition` accepts any known stage). Submittals already govern set approval, and `drawings.stage` is deprecated for rollups.

**Recommendation:** a BEFORE UPDATE trigger that refuses IFC or Released on a sheet whose governing submittal is Rejected or Revise and Resubmit. It needs the same governing-submittal selection as `evaluate_fab_release_set`, so it should be written alongside that function, not here.

### 4.3 Per-project transition definitions

The prompt asks for these. The current design keeps one reviewed plpgsql graph plus global feature flags, and several harnesses capture it hash-for-hash.

Moving the graph into per-project data would multiply the paths that must be proven. **Recommended only if a customer contract needs a different review sequence.**

## 5. Risks and observations found during the audit

1. **High (fixed on this branch):** `submittalReviewEngine.js` `runAnalysis` parsed `required_date` with `new Date(...)` (UTC midnight). In Arizona the review strip marked a package overdue from 5 PM the day before it was due; under UTC it reported "1 day past" on the due date. Now compares local calendar days. The new test fails on the old code.
2. **Medium:** `package-lock.json` is out of sync for `npm` 10 (sharp/undici overrides), but `npm` 11 (Node 24, as CI uses) installs cleanly. Developers on Node 22 hit `npm ci` failure.
3. **Medium:** `pma_audit_logs` keeps a misleading legacy name while it is the live row audit, and `pmaRemoval.test.ts` treats the name as retired. A rename (or a view named for its purpose) would remove the trap.
4. **Low:** several comments still name the fabricator, for example `submittalStageMapping.ts:21,30,31,40,44,179`, plus 9 other source files. The rule is about product logic, and these are comments, but they are worth a sweep.
5. **Low:** `drawing-governing` and `drawing-revision-atomic` harnesses are not referenced by any workflow, so they never run in CI.

## 6. Acceptance status (local, 2026-10-18, Node 22 + npm 11, Linux)

| Check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `typecheck`, `typecheck:js`, `typecheck:strict`, `typecheck:noimplicitany` | exit 0 (strict and noImplicitAny: 0 enforced errors) |
| `check:no-new-js`, `check:hooks` | exit 0 |
| `npx vitest run` (TZ=UTC) | **911 files, 9,161 tests passed** (baseline before this branch: 903 files, 9,108 tests) |
| `npm run build` | exit 0 |
| `supabase/tests/append-only-activity` | 11 passed, 0 failed (PGlite, single session) |
| `playwright.foundation.config.ts` | 158 passed, 2 failed. The 2 failures are `staging-network.contract.spec.ts` and fail identically on untouched `main` in this sandbox (pre-installed Chromium build 1194 vs Playwright 1.61), so they are environmental, not from this branch. The new `doc-control.spec.ts` passes in both themes at 1440px and 390px. |
| Hosted staging acceptance (roles, RLS, concurrency, real records) | **Not done.** Needs the staging branch and owner approval. |
| DB candidate applied or stamped | **No.** |
