-- 20260526230000_drawing_sets_readiness_flags.sql
--
-- Detailing Control Center, Phase 2: two MANUAL operational-readiness flags on
-- drawing_sets (the "Detailing Package"). The other readiness signals
-- (RFI-blocked, revision-impacted, fabrication/erection-ready, CO exposure,
-- schedule risk, partial-release %) are DERIVED read-models computed from the
-- existing engines + linked data, so they are intentionally NOT stored (can't
-- drift). These two are human judgments with no deterministic source:
--   * material_impacted  -- existing/ordered material is affected
--   * long_lead_impact   -- the package gates a long-lead procurement item
-- Additive + nullable; NULL = not flagged. New columns inherit the existing
-- drawing_sets RLS policies (no policy change). Lead-time config for the
-- backward-scheduled dates lives in projects.metadata / drawing_sets.metadata
-- (JSONB, no migration). Applied live via Supabase MCP. See
-- docs/detailing-control-center-design.md sections 4-6.

ALTER TABLE public.drawing_sets
  ADD COLUMN IF NOT EXISTS material_impacted boolean;

ALTER TABLE public.drawing_sets
  ADD COLUMN IF NOT EXISTS long_lead_impact boolean;

NOTIFY pgrst, 'reload schema';
