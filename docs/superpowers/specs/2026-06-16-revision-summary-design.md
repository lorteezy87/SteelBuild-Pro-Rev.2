# AI Revision Summary — Design Spec

- **Date:** 2026-06-16
- **Status:** Design approved; pending spec review → implementation plan
- **Owner workflow:** Drawings + Submittals / Revision Intelligence (the moat)

## Goal

When a revision is uploaded for an existing drawing set, **instantly** show a
concise digest of what changed and what it threatens — sheets changed, high-risk
(already-downstream) changes, affected work packages, a likely-RFI flag, and a
qualitative cost/schedule impact — and persist it as a point-in-time audit
record. The expensive AI per-sheet visual diff stays the one-click deep-dive
(the existing Impact Report), never auto-run.

## Locked decisions

1. **AI depth:** deterministic digest auto-runs on upload (instant, free); the AI per-sheet diff stays on demand.
2. **Surface:** a post-upload **card** + a `revised · N changes` **badge** on the set that re-opens it.
3. **Persistence:** a lightweight **point-in-time record** (new table) — captures what was downstream *at the time of the revision*.

## Architecture

One new pure engine, one small table, one card. Everything heavy already exists;
this orchestrates it.

- **Reuse:** `computeRevisionImpact` (`src/lib/detailingRevisionImpact.js`),
  `selectChangedSheets` (`src/lib/revisionPackageReport.js`),
  `buildRevisionImpactRows` (`src/lib/revisionImpactBoard.ts`),
  `RevisionImpactReportModal` (the AI deep-dive), and the `RFIFormModal` `prefill`
  prop (RFI-from-delta path).

## 1. Engine — `src/lib/revisionSummary.js` (pure, tested)

`buildRevisionSummary({ set, revisions, rfis, drawingSets, workPackages, modelElements, today })`

Composition: filter `revisions` to the set's sheets → `computeRevisionImpact` →
`buildRevisionImpactRows` → aggregate. Output:

```
{
  setId, setName, generatedAt,
  sheetsChanged: number,
  changedSheets: [{ drawingId, sheetNumber, revisionCode, downstream, severity }],
  highRisk:      [{ drawingId, sheetNumber, reason }],
  highRiskCount: number,
  affectedWorkPackages: string[],
  likelyRfi: { needed: boolean, reason: string, sheets: string[] },
  impact:    { level: "none"|"low"|"medium"|"high", note: string },
  openRfiCount: number,
  fabBlocked: boolean,
}
```

### Derivations (all deterministic)
- **sheetsChanged / changedSheets** — `selectChangedSheets` (supersedes a prior, or version > 1) + its downstream status.
- **highRisk** — a changed sheet that is **downstream** (fabricated / delivered / in-field) OR on a `material_impacted` / `long_lead_impact` set. `reason` names which.
- **affectedWorkPackages** — union of the changed sheets' sets' `linked_work_package_ids` → WP names.
- **likelyRfi** — `needed = true` when a high-risk changed sheet has **no** existing open linked RFI (changing already-fabricated steel typically needs one). `sheets` lists them.
- **impact.level** — `high` if any changed sheet is in-field; `medium` if any delivered/fabricated; `low` if changes but none downstream; `none` if no changes. Bumped one step by a material/long-lead flag. `note` is a one-line human summary (e.g. "2 sheets already fabricated — rework likely"). **No dollar figure** (the Backcharge feature owns actual $).

## 2. Persistence — `drawing_revision_summaries`

One row per set per upload event (a snapshot):

```sql
create table public.drawing_revision_summaries (
  id uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  drawing_set_id  uuid references public.drawing_sets(id) on delete cascade,
  set_name        text,
  sheets_changed  int  not null default 0,
  high_risk_count int  not null default 0,
  likely_rfi      boolean not null default false,
  impact_level    text not null default 'low'
                  check (impact_level in ('none','low','medium','high')),
  summary         jsonb not null default '{}'::jsonb,  -- the full digest object above
  generated_at    timestamptz not null default now(),
  generated_by    uuid references auth.users(id),
  is_deleted      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index on public.drawing_revision_summaries (project_id, drawing_set_id, generated_at desc);
```

- **RLS** (project membership, role-floored per the 2026-06-10 model): SELECT to members (`user_has_project_access`); INSERT ≥ `field` (revision uploaders); DELETE ≥ `pm`; no UPDATE (immutable snapshot).
- Migration follows the timestamped pattern; applied live via Supabase MCP; `NOTIFY pgrst` for the new table.
- **Pure engine** lives in `src/lib/revisionSummary.js` (no I/O). **Persistence** is a separate self-contained repository `src/lib/revisionSummaryRepo.ts` (`saveRevisionSummary`, `getLatestSummariesByProject` → `Map` keyed by `drawing_set_id`), importing `supabase` directly — matching the backcharge / payapp repo pattern. Keeps the engine pure + testable.

## 3. Surface

- **`RevisionSummaryCard`** (`src/components/drawings/RevisionSummaryCard.jsx`): shown when `RevisionUploadModal` completes. Renders the digest (changed sheets, high-risk highlighted, affected WPs, likely-RFI with a **Create RFI** affordance — opens `RFIFormModal` with a prefill built from the high-risk sheet (a small `buildRfiPrefillFromSheet` helper: title references the sheet # + revision, links the drawing), distinct from the existing delta-based `buildRfiPrefillFromDelta` — impact level + note) and a **"Run AI deep-dive →"** button that opens `RevisionImpactReportModal`.
- **Set badge**: a `revised · N` chip on the set row in the Drawing Register (`DrawingRegisterTable`) and the Process/Control boards, reading the **latest** persisted summary for the set; click re-opens the card from the persisted record.
- **Trigger**: both revision-upload hosts — the hub Register (`components.tsx` `revisionSet` → `RevisionUploadModal onComplete`) and the standalone `Drawings.jsx` revision modal — call `buildRevisionSummary` → persist → show the card on completion.

## 4. Testing
- `src/lib/__tests__/revisionSummary.test.js` (vitest, deterministic with injected `today`): the aggregation + the likely-RFI and impact-level heuristics across downstream/flagged/clean cases, and the "no changes" empty case.
- Light wiring check that the card renders from a built summary.

## Out of scope (YAGNI)
- Auto-running the AI per-sheet diff (stays on demand).
- A dollar-value cost estimate (qualitative level only; Backcharge owns $).
- Editing a persisted summary (immutable snapshot; regenerate on a new upload).
- Email/notification of the summary (future).

## Validation (per the ladder)
`vitest` (engine) → `npm run lint` → `npm run typecheck` → `vite build`; migration applied live + committed; commit + deploy; report.
