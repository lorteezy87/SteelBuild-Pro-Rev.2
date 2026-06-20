-- Add cost-code linkage to SOV line items so the SOV importer can auto-map
-- (and the CO -> SOV-line workflow can reference) a steel cost code. Additive +
-- nullable: no backfill, existing rows unaffected. RLS on sov_items is
-- row-level (project_member_access), so the new columns are already covered.

ALTER TABLE public.sov_items
  ADD COLUMN IF NOT EXISTS cost_code text,
  ADD COLUMN IF NOT EXISTS cost_code_name text;

COMMENT ON COLUMN public.sov_items.cost_code IS 'Steel cost-code number (e.g. "06") linking this SOV line to cost_codes; set on import via auto-map or explicitly.';
COMMENT ON COLUMN public.sov_items.cost_code_name IS 'Human-readable cost-code name (e.g. "Shop Labor and Fabrication") captured alongside cost_code for display.';

NOTIFY pgrst, 'reload schema';
