# Unused-index review — 2026-05-26

Resolves the "Unused-index review" item in [`TECH_DEBT.md`](../TECH_DEBT.md).
The Supabase performance advisor flagged a large set of `unused_index` findings
(`idx_scan = 0`). This is the reviewed drop/keep verdict. **No indexes were
dropped** as part of writing this — index drops are production DDL with
planner-regression risk, so the high-confidence drops below are queued with
ready-to-run, reversible SQL pending an explicit go-ahead.

## Method

Findings were pulled live from `pg_stat_user_indexes` (not the advisor text) so
each could be judged with full context — `idx_scan`, size, unique/primary flags,
column list, whether the index backs a foreign key, and whether it is a leading-
column prefix of another index. Drop candidates were then checked against actual
query patterns in `src/` (PostgREST call sites) before any verdict.

## The numbers

`idx_scan = 0` on **170** indexes in `public`:

| Bucket | Count | Verdict |
| --- | --- | --- |
| Primary keys | 20 | **Keep** — enforce the PK constraint |
| Unique (non-PK) | 17 | **Keep** — enforce uniqueness |
| Non-unique, **back a FK** | 88 | **Keep** — see below |
| Non-unique, no FK | ~43 | Reviewed individually (below) |

### Why "unused" is misleading here

Every table is tiny: largest is `pma_audit_logs` (1,374 rows), then `drawing_activity`
(681), `llm_telemetry` (398), `drawings` (286), `work_packages` (141), `submittals`
(26), `projects` (15), `risks` (0). At these row counts the planner often won't
choose an index at all (a seq scan of 286 rows is faster), so `idx_scan = 0` mostly
reflects **low data volume + low traffic**, not a useless index. Their present-day
value is constraint enforcement and FK-join/cascade performance *as projects grow*;
their present-day cost is write-amplification on high-churn tables (`drawings`:
4,486 updates; `schedule_tasks`: 4,466; `drawing_activity`: 3,559 inserts).

## Keep (125 of 170) — not negotiable

- **20 primary-key + 17 unique indexes** — these enforce constraints, not just
  query speed. Dropping them changes data integrity, never just performance.
- **88 FK-backing indexes** — these cover the referencing columns of a foreign
  key (many were added deliberately in migration `20260526160000` to fix the
  "unindexed FK" advisor). They speed up joins, `ON DELETE` cascades, and the
  per-row FK check on the *referenced* side's mutations. They read as unused only
  because volume is low; at scale they are exactly the indexes you want. Dropping
  them re-opens the advisor finding the migration closed.

## Drop — high confidence (5)

Reviewed against the codebase; safe to drop now. Each `DROP INDEX CONCURRENTLY`
is fully reversible (the `CREATE` to restore is listed beside it).

| Index | Table | Why safe |
| --- | --- | --- |
| `idx_number_sequences_project_id` `{project_id}` | `number_sequences` | Unused **and** a leading-column prefix of the unique `uq_number_sequences_project_record {project_id, record_type}`, which already serves `WHERE project_id = …` lookups. Pure redundancy. |
| `idx_drawings_callouts_gin` `{callouts}` (GIN, 56 kB) | `drawings` | No server-side containment query (`.contains()`/`.overlaps()`/`@>`) touches `callouts` — it's read as a field and processed client-side. GIN maintenance runs on every one of the table's 4,486 updates. |
| `idx_drawings_markup_gin` `{markup}` (GIN, 56 kB) | `drawings` | Same as above for `markup`. |
| `idx_work_packages_drawing_ids` `{drawing_ids}` (GIN, 48 kB) | `work_packages` | `drawing_ids` is matched in JS (the autoLinkEngine pattern), never via a PostgREST array-containment query. No GIN consumer. |
| `idx_work_packages_rfi_ids` `{rfi_ids}` (GIN, 16 kB) | `work_packages` | Same as above for `rfi_ids`. |

Verification that drove these: every `.contains(` in `src/` is DOM
`Node.contains()` (click-outside handlers); there are **zero** PostgREST
`.contains()` / `.overlaps()` / `.textSearch()` calls against these columns.

Ready-to-run (idempotent + reversible):

```sql
-- number_sequences: covered by the unique (project_id, record_type) index
DROP INDEX CONCURRENTLY IF EXISTS public.idx_number_sequences_project_id;
-- restore: CREATE INDEX idx_number_sequences_project_id ON public.number_sequences (project_id);

-- drawings GIN: no array-containment / jsonb query consumes these
DROP INDEX CONCURRENTLY IF EXISTS public.idx_drawings_callouts_gin;
-- restore: CREATE INDEX idx_drawings_callouts_gin ON public.drawings USING gin (callouts);
DROP INDEX CONCURRENTLY IF EXISTS public.idx_drawings_markup_gin;
-- restore: CREATE INDEX idx_drawings_markup_gin ON public.drawings USING gin (markup);

-- work_packages GIN: drawing_ids / rfi_ids are matched in JS, not by @>
DROP INDEX CONCURRENTLY IF EXISTS public.idx_work_packages_drawing_ids;
-- restore: CREATE INDEX idx_work_packages_drawing_ids ON public.work_packages USING gin (drawing_ids);
DROP INDEX CONCURRENTLY IF EXISTS public.idx_work_packages_rfi_ids;
-- restore: CREATE INDEX idx_work_packages_rfi_ids ON public.work_packages USING gin (rfi_ids);
```

> `DROP INDEX CONCURRENTLY` cannot run inside a migration transaction block. Run
> it directly (Supabase MCP `execute_sql`) and commit a matching
> `migrations/*.sql` afterward for history (the plain `DROP INDEX IF EXISTS`
> form is fine inside the committed migration, since the index is already gone).

## Keep for now — real (if rare) read paths

These are non-FK and currently idle, but back genuine query patterns; leave them:

- `drawing_activity.idx_drawing_activity_drawing {drawing_id, created_at}` — the
  per-drawing activity timeline feed.
- `drawing_links.idx_drawing_links_record_lookup {linked_record_type, linked_record_id}`
  — reverse "what links to this record" lookups.
- `drawings.idx_drawings_upload_batch_id {upload_batch_id}` — groups a single
  import batch during the drawing-set upload flow.
- `llm_telemetry.idx_llm_telemetry_{project,provider,use_case}` — the LLM
  telemetry time-series queries (`… , occurred_at`).
- `pma_audit_logs.idx_audit_logs_{created,entity}` — audit lookups by entity and
  by time on the largest table.
- `change_orders.idx_change_orders_source_rfi`, `idx_change_orders_sov_line` —
  **brand-new** (2026-05-26 CO-from-RFI feature), partial indexes on the link
  columns; unused only because the feature just shipped.
- `bluebeam_oauth_states.bluebeam_oauth_states_expires_idx {expires_at}` —
  supports the expired-state cleanup sweep.

## Defer — low-value either way (revisit with a data-driven pass at scale)

The remaining ~25 are single-column filter/sort indexes on small tables
(`*_status`, `*_severity`, `*_area`, `is_deleted`, `is_summary`, `created_at`,
`*_number`, `crew_id`, `constraint_type`, `entity_type/entity_id`, etc.). At
current row counts they neither help nor measurably hurt. Dropping them saves
little; keeping them risks nothing meaningful. Recommendation: leave until a real
workload exists, then re-run this review against `idx_scan` over a known traffic
window and drop the ones still cold. The weakest (low-selectivity boolean) of
these — `quality_control_records.idx_qcr_is_deleted`, `schedule_tasks.schedule_tasks_is_summary_idx`,
`risks.risks_status_idx`/`risks_severity_idx` (0-row table) — are the first to
reconsider, but the payoff is negligible.

## Separate observation — redundant but *active* (out of scope, do not drop here)

Several single-column indexes are leading-column prefixes of a composite/unique
index **and are actively scanned** (`idx_user_projects_user_id` 217 scans,
`idx_task_deps_pred` 892, `idx_action_items_project_id` 469, `idx_email_messages_project`
36, …). Postgres prefers them because they're smaller. They could be consolidated
away (the composite would serve the leading-column lookup), but that is an
index-*consolidation* change with a small planner-regression risk — explicitly a
different task from this unused-index review, and not recommended as part of it.
