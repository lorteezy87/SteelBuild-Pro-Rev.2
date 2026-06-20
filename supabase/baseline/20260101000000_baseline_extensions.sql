-- ─────────────────────────────────────────────────────────────────────────────
-- BASELINE (1/3) — extensions preamble
--
-- Prerequisites that `supabase db dump --schema public,storage` OMITS (extensions
-- live in the `extensions` schema, which the dump doesn't include) but which the
-- dumped schema depends on. This file is applied FIRST in the squashed baseline,
-- before the schema dump (2/3) and the seed (3/3).
--
-- Part of the DB-baseline cutover — see docs/db-baseline-cutover.md. Do NOT add
-- this to supabase/migrations/ until the cutover (it is timestamped earlier than
-- every existing migration on purpose, to become the replay floor).
--
-- Verified against live kjrwqagyeswwoxpjkcko 2026-06-20:
--   extensions present: uuid-ossp, pgcrypto, pg_trgm (extensions schema);
--   pg_net (public), pg_cron (pg_catalog) — Supabase-managed (see note below);
--   plus Supabase defaults (supabase_vault, pgmq, wrappers, btree_gist,
--   pg_stat_statements) which a fresh Supabase project already provisions.
-- ─────────────────────────────────────────────────────────────────────────────

-- App-required extensions a normal migration role can create. Idempotent.
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto    with schema extensions;
create extension if not exists pg_trgm     with schema extensions;

-- pg_net (HTTP) and pg_cron (scheduler) are Supabase-managed and may require
-- dashboard enablement on a fresh project/branch — a plain migration role often
-- cannot `create extension` them. They back the scheduled jobs seeded in
-- baseline 3/3 (which is guarded to no-op when pg_cron is absent). If the
-- disposable-branch replay (cutover STEP 5) reports them missing, enable them on
-- the branch via the dashboard / `select` against the Supabase extensions API,
-- then re-run. Left commented so the core baseline replays without elevated rights:
-- create extension if not exists pg_net;
-- create extension if not exists pg_cron;
