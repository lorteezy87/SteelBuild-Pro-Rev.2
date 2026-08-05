-- 20260526180000_drop_unused_indexes.sql
--
-- Drop 5 high-confidence unused indexes identified in the 2026-05-26 unused-index
-- review (see docs/unused-index-review-2026-05-26.md). These were dropped live via
-- `DROP INDEX CONCURRENTLY` through the Supabase MCP; this migration is the repo/DB
-- history parity record and is therefore written with the plain (transaction-safe)
-- `DROP INDEX IF EXISTS` form — it is a no-op against the already-updated database.
--
-- Verdict basis:
--   * idx_number_sequences_project_id — redundant: a leading-column prefix of the
--     unique uq_number_sequences_project_record (project_id, record_type), which
--     already serves WHERE project_id = … lookups.
--   * the 4 GIN array indexes — no PostgREST containment query (.contains()/
--     .overlaps()/@>) consumes drawings.callouts / drawings.markup /
--     work_packages.drawing_ids / work_packages.rfi_ids; the arrays are matched
--     in JS (the autoLinkEngine pattern). GIN maintenance otherwise runs on every
--     write to the high-churn drawings table.
--
-- Reversible — the restore CREATE for each is in the doc. FK-backing and
-- constraint (PK/unique) indexes were deliberately KEPT (see the review).

DROP INDEX IF EXISTS public.idx_number_sequences_project_id;
DROP INDEX IF EXISTS public.idx_drawings_callouts_gin;
DROP INDEX IF EXISTS public.idx_drawings_markup_gin;
DROP INDEX IF EXISTS public.idx_work_packages_drawing_ids;
DROP INDEX IF EXISTS public.idx_work_packages_rfi_ids;
