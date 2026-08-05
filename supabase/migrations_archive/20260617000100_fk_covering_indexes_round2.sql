-- =============================================================================
-- Phase 1b — Covering indexes for unindexed foreign keys (app schema)
-- Project: kjrwqagyeswwoxpjkcko
--
-- Clears 14x unindexed_foreign_keys (perf) advisor findings in `public`.
-- Each FK below was verified on 2026-06-17 to be single-column with NO existing
-- covering index (has_covering_index = false). Column names resolved from
-- pg_constraint.conkey -> pg_attribute (authoritative, not name-convention).
--
-- The 15th finding (stripe._managed_webhooks.fk_managed_webhooks_account) is in
-- the wrapper-managed `stripe` schema and is intentionally excluded.
--
-- IF NOT EXISTS makes this idempotent / replay-safe. These tables are young and
-- low-volume today, so plain CREATE INDEX inside a transaction is fine. If any
-- of these (fab_releases, backcharges, pay_applications) later carry real row
-- volume, recreate that one with CREATE INDEX CONCURRENTLY outside a txn.
-- =============================================================================

create index if not exists idx_backcharge_events_actor
  on public.backcharge_events (actor);

create index if not exists idx_backcharge_tm_tickets_created_by
  on public.backcharge_tm_tickets (created_by);

create index if not exists idx_backcharges_cost_code_id
  on public.backcharges (cost_code_id);

create index if not exists idx_backcharges_created_by
  on public.backcharges (created_by);

create index if not exists idx_billing_events_org_id
  on public.billing_events (org_id);

create index if not exists idx_drawing_revision_comparisons_from_revision_id
  on public.drawing_revision_comparisons (from_revision_id);

create index if not exists idx_drawing_revision_comparisons_to_revision_id
  on public.drawing_revision_comparisons (to_revision_id);

create index if not exists idx_drawing_revision_summaries_drawing_set_id
  on public.drawing_revision_summaries (drawing_set_id);

create index if not exists idx_drawing_revision_summaries_generated_by
  on public.drawing_revision_summaries (generated_by);

create index if not exists idx_fab_releases_project_id
  on public.fab_releases (project_id);

create index if not exists idx_organization_invitations_invited_by
  on public.organization_invitations (invited_by);

create index if not exists idx_organizations_created_by
  on public.organizations (created_by);

create index if not exists idx_pay_applications_created_by
  on public.pay_applications (created_by);

create index if not exists idx_vendors_org_id
  on public.vendors (org_id);
