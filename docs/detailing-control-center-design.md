# Detailing Control Center — Design Doc (Phase 0)

Status: **APPROVED 2026-05-26** (design + all §9 decisions signed off). Maps the
vision onto the *actual* current schema/code and proposes a minimal, additive plan
that does not break the working drawings/submittals flow (the killer workflow /
moat). Phase 1 in progress.

Vision (verbatim intent): stop tracking *"was it submitted?"* and start tracking
*"what operational state is this package in, and what does the schedule need from
it — working backward from the erection sequence."*

---

## 1. The model

```
Level 1  Project              projects
Level 2  Drawing Package/Area drawing_sets         ← the operational "Detailing Package"
Level 3  Sheets               drawings  (drawing_set_id → drawing_sets.id)
Level 4  Revisions            drawing_revisions  (drawing_id → drawings.id, supersedes_revision_id)
         Approval workflow    submittals / submittal_rounds / submittal_sheet_responses
         Sequence             work_packages (sequence_number, area, scheduled_start_date)
```

**Decision (confirmed): the "Detailing Package" is an additive elevation of the
existing `drawing_sets` row** — not a new entity. Submittals stay the approval
state machine. This preserves the working auto-lock, the preserved set names, and
the submittal-driven rollups.

---

## 2. Current state — what ALREADY exists (verified against the live DB + code)

The foundation is ~70–80% built. Verified facts:

**`drawing_sets` (the Package) already has:** `set_name`, `discipline`,
`status`, `set_approval_status` / `set_approved_date` / `set_approved_by` /
`set_approval_notes`, `current_submittal_id` + `submittal_status`,
`is_locked`/`locked_at`/`locked_by`/`locked_reason`, `eor_reviewer`,
**`area_sequence`** (an area/sequence tag), **`due_date`**, and
**`linked_work_package_ids` (uuid[])** — i.e. the Package↔sequence link the
backward-scheduling needs *already exists*.

**`drawings` (Sheets) already has:** `drawing_set_id`, `sheet_number`, `title`,
`revision_number`, `stage` (deprecated for rollups per §20), `due_date`,
`priority_flag`, `is_superseded`, `linked_rfi_ids`, and **per-sheet
`fabrication_start_date` / `fabrication_finish_date` / `ready_for_install_date` /
`final_delivery_date`** — sheet-level fab/delivery dates already exist.

**`drawing_revisions` (Revisions):** `revision_code`, `revision_name`,
`version_number`, `is_current`, `issued_at`, `received_at`,
`supersedes_revision_id` (the supersede chain). Plus
`drawing_revision_comparisons` / `drawing_revision_deltas` (the "what changed
between revs" engine).

**Submittals (approval authority):** `submittals` (status, `ball_in_court`,
`required_date`, `drawing_set_ids[]`, `linked_rfi_ids[]`, `current_round_id`,
`days_in_review`), `submittal_rounds` (per-round), and **`submittal_sheet_responses`**
(per-sheet `response_status` within a round → the data backbone for *Partially
Released*). Workflow logic in `src/lib/submittalStageMapping.js`: the canonical
`Not Started → IFA → OFA → BFA → OFS → IFC → Released` flow is **derived** from
`(status, ball_in_court)`; `derivedSetStage()` rolls a set's submittals up to a
stage; `useSubmittals.ts` auto-locks linked sets on terminal approval.

**`work_packages` (Sequence):** `sequence_number`, `area`, `scheduled_start_date`/
`_end_date`, `phase`/`trade_phase`/`shipping_phase`/`install_phase`,
`drawing_ids[]`, `sequence_confirmed`. The erection-sequence source of truth.

**Engines already built (reuse, don't rebuild):**
- `scheduleCascade.ts` — `computeEffectiveDates()`, `parseDependencies()`,
  `applyScheduleGates()` → dependency/backward date cascade.
- `marginRiskEngine.ts` — `calculateMarginRisk()` → **CO exposure**, RFI aging,
  schedule-slip exposure scoring.
- `constraintEngine.ts` — `deriveOperationalConstraints()` → auto-flag blockers
  (RFI blocked, etc.).
- `autoLinkEngine.js` — extracts S3.2 / WP-104 / RFI-001 refs and links entities.

**Nav (already partly there):** there is already a sidebar group literally named
**"Detailing"** containing the unified hub page **`DrawingSubmittalHub`** (label
"Drawings & Submittals", `src/config/routes.js`). `Submittals` = "Submittal
Register". So the reframe is mostly relabel + restructure, not a new module.

**Rich UI already built:** `DrawingKanban`, `DrawingsGrid`, `DrawingsTable`,
`StagePipeline`, `AdvanceStageDialog`, `SetApprovalModal`, `RevisionHistoryPanel`,
`RevisionUploadModal`, `DrawingSetUploadModal`, `ExportFabReleaseModal`;
submittals: `SubmittalVisualBoard`, `RoundTimeline`, `SheetResponseGrid`,
`AgingReportTable`, `CycleTimeCard`; and in the drawing viewer a zone-level
`ReadinessRing`, `DependenciesTab`, `AddDependencyModal`.

---

## 3. The operational-state model (the crux)

We do **not** build a competing state machine. The package's single
**operational state** is a *coalesce* across three phases:

```
DRAFTING (manual, pre-submittal)        SUBMITTAL (derived, authority)         RELEASE (manual/triggered, post-fab)
Not Started → In Detailing →            Submitted → Under Review →             Released for Fab →
Internal Review → Ready to Submit       R&R / Approved as Noted / Approved     Partially Released → Released for Erection
                                                                               (Superseded = orthogonal, from revisions)
```

- **Submittal phase = existing authority.** When a set has an active submittal,
  its state is the *derived* stage (`derivedSetStage()`), unchanged. "Submitted /
  Under Review / R&R / Approved as Noted / Approved / Released for Fab" already
  map onto IFA→Released — **no new states needed here.**
- **Drafting phase = net-new, manual.** `Not Started → In Detailing → Internal
  Review → Ready to Submit` precede any submittal. Stored on the package
  (`drawing_sets`) because no submittal exists yet.
- **Release phase = net-new.** `Partially Released` (derive from
  `submittal_sheet_responses` coverage), `Released for Erection` (manual/triggered
  downstream of fab). `Superseded` derives from `drawing_revisions`.

Effective state = `released_state` (if set) ELSE `derived submittal stage` (if a
submittal exists) ELSE `detailing_state` (drafting) ELSE `Not Started`. This keeps
§20 intact (submittals own the middle) while adding the two ends.

---

## 4. Operational readiness — derived vs stored

Prefer **derived** (deterministic engines) over manual flags wherever possible:

| Readiness signal | Source |
| --- | --- |
| RFI Blocked | DERIVED — open linked RFIs via `constraintEngine.deriveOperationalConstraints()` / `linked_rfi_ids` |
| CO Exposure | DERIVED — `marginRiskEngine.calculateMarginRisk()` |
| Revision Impacted | DERIVED — a newer `drawing_revisions` rev not yet acknowledged downstream |
| Fabrication Ready | DERIVED — state ≥ Released for Fab AND not RFI-blocked AND no impacting open revision |
| Erection Ready | DERIVED — Fabrication Ready AND fab complete (sheet fab dates / WP) AND delivery confirmed |
| Priority Sequence | DERIVED — linked WP `sequence_number` flagged critical |
| Material Impacted | **STORED** (manual judgment) — net-new boolean |
| Long Lead Impact | **STORED** (manual judgment) — net-new boolean |

So only ~2 truly manual flags need storing; the rest are computed read-models.

---

## 5. Backward-date model (sequence-driven)

Source of truth = the linked work package's erection date
(`work_packages.scheduled_start_date` via `drawing_sets.linked_work_package_ids`).
Work backward with configurable lead offsets:

```
Erection start (WP.scheduled_start_date)
  − erection-prep lead   → Erection Release Required By
  − ship/install lead    → Fab Release Required By
  − fab duration         → Approval Needed By
  − approval cycle       → Submit By
  − internal review lead → Internal Review Due
  − detailing duration   → Detailing Start
```

Computed by reusing `scheduleCascade` patterns (offset/dependency math), surfaced
as **required-by** dates next to the package's **actual** dates (`submitted_date`,
`approved_date`, sheet fab dates) to compute slack / "Risk to Schedule." Unknown
sequence dates stay `null` and render **TBD** (never invent dates — §22).

---

## 6. Schema changes (additive only, minimal)

On `drawing_sets` (all nullable; no backfill of fake data):
- `detailing_state text` — drafting/release sub-state (only authoritative when no
  submittal governs; see §3).
- `material_impacted boolean`, `long_lead_impact boolean` — manual readiness.
- Backward target dates: `detailing_start_date`, `internal_review_due`,
  `submit_by_date`, `approval_needed_by`, `fab_release_required_by`,
  `erection_release_required_by` (dates). (`due_date`, `area_sequence`,
  `linked_work_package_ids` already exist.)

Everything else (RFI-blocked, CO exposure, revision-impacted, fab/erection ready,
sequence readiness, partial-release %) is a **computed read-model**, not stored —
so it can't drift. RLS: new columns inherit the existing `drawing_sets` policies
(no policy change). Migration is one additive `ALTER TABLE` + `NOTIFY pgrst`.

---

## 7. Dashboard widgets (Phase 3)

All computable from the above + existing engines: **Detailing Pipeline**
(reuse `StagePipeline` over the coalesced state), **Packages Due Soon** (backward
dates vs today), **Approval Bottlenecks** (`days_in_review`, `ball_in_court`),
**Revision Impact Tracker** (`drawing_revision_deltas` + downstream fab/ship/erect
status), **Sequence Readiness** (group packages by WP `sequence_number` → Detailing
% / Fab Ready / Delivery Ready / Erection Ready).

---

## 8. Phased plan

- **Phase 1 — reframe — SHIPPED 2026-05-26:** renamed the hub →
  "Detailing Control Center" (`e0256ccd`); additive `detailing_state` column
  (migration `20260526220000`, `32c68af1`); the coalesced operational-state helper
  `src/lib/detailingPackageState.js` + 12 tests (`32c68af1`); the hub now shows
  each package's effective operational state (chips on the Control Board + rows)
  with a manual drafting-state advance control that writes `detailing_state`,
  gated to packages without a governing submittal (`c4af3ee9`). The Project →
  Package → Sheets → Revisions structure already exists via the hub tabs (Control
  Board / Process Board / Drawing Register / Submittal Register / Approval Matrix);
  a dedicated 4-level tree view is later polish.
- **Phase 2 — operational layer — SHIPPED 2026-05-26:** 2A (`569fa06b`) — migration
  `20260526230000` (`material_impacted` + `long_lead_impact`) + `detailingSchedule.js`
  (`computeBackwardDates` / `resolveLeadDays` / `computeScheduleRisk`, 9 tests; default
  chain reproduces the Apr-28-for-Jun-10 worked example). 2B (`4384f308`) —
  `detailingReadiness.js` per-package read-model (7 tests). 2C (`e655cc89`) — the hub
  loads work_packages + RFIs, maps each package to its linked WP, and surfaces an "At
  Risk" command-bar signal + a Schedule & Readiness panel (risk badge, the 6 backward
  dates, readiness chips, manual flag toggles) on the Control Board.
- **Phase 3 — sequence + dashboard — MOSTLY SHIPPED 2026-05-26:** Sequence
  Readiness rollup (group by WP `sequence_number` → detailing % / fab-ready /
  erection-ready / at-risk) shipped on the Control Board (`e9dbe24e`,
  `computeSequenceReadiness`). Of the 5 design widgets, three already exist in the
  hub: **Detailing Pipeline** = the "Open Pipeline" panel, **Packages Due Soon** =
  the "Due Next 7 Days" list, **Approval Bottlenecks** = the Approval Matrix tab
  (CycleTimeCard + AgingReportTable). Remaining net-new: the **Revision Impact
  Tracker** (drawing_revision_deltas + downstream fab/ship/erect status).
- Each phase ships independently, behind a feature flag if desired, without
  breaking the current Drawings/Submittals pages.

---

## 9. Resolved decisions (signed off 2026-05-26)

1. **Drafting state advance** — **manual buttons in v1** (`In Detailing →
   Internal Review → Ready to Submit`); auto-suggest later.
2. **Backward-date lead times** — **per-project defaults + per-package override.**
3. **Placement** — **elevate the existing `DrawingSubmittalHub` in place** (rename
   to "Detailing Control Center"; keep `Drawings` + `Submittal Register` as
   drill-downs).
4. **Partially Released granularity** — **per-sheet** (via
   `submittal_sheet_responses`), **rolled to a % on the package.**
