-- 086_default_cost_codes.sql
--
-- Creates org-level default cost codes that auto-seed into each new project's
-- budget control (cost_codes table). Admins configure which codes are active
-- and set default budget amounts from Settings → Cost Codes.
--
-- Mechanism:
--   1. default_cost_codes table (org-level, not project-scoped)
--   2. Trigger on INSERT INTO projects copies active defaults into cost_codes
--   3. Seed with the standard 14 steel cost codes

-- ─── 1. Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.default_cost_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cost_code_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  default_budget_amount NUMERIC DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── 2. RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.default_cost_codes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read defaults (needed for UI display)
CREATE POLICY "default_cost_codes_read"
  ON public.default_cost_codes FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can modify defaults
CREATE POLICY "default_cost_codes_admin_write"
  ON public.default_cost_codes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─── 3. Trigger function ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_project_cost_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only seed if this project has no cost codes yet
  IF EXISTS (
    SELECT 1 FROM public.cost_codes
    WHERE project_id = NEW.id
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cost_codes (
    project_id, project_name, cost_code_number, description,
    category, phase, budget_amount, actual_cost, committed_cost,
    forecast_to_complete, metadata
  )
  SELECT
    NEW.id,
    COALESCE(NEW.name, ''),
    d.cost_code_number,
    d.description,
    d.category,
    d.category,  -- phase = category for backwards compat
    d.default_budget_amount,
    0,
    0,
    0,
    jsonb_build_object('auto_seeded', true, 'source', 'default_cost_codes')
  FROM public.default_cost_codes d
  WHERE d.is_active = true
  ORDER BY d.sort_order;

  RETURN NEW;
END;
$$;

-- ─── 4. Trigger on new project creation ───────────────────────────────
DROP TRIGGER IF EXISTS trg_seed_project_cost_codes ON public.projects;
CREATE TRIGGER trg_seed_project_cost_codes
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_project_cost_codes();

-- ─── 5. Seed with standard 14 steel cost codes ───────────────────────
INSERT INTO public.default_cost_codes (cost_code_number, description, category, sort_order, is_active)
VALUES
  ('01', 'Detailing',                 'Subcontractor', 1,  true),
  ('02', 'Anchor Bolts/Embeds',       'Materials',     2,  true),
  ('03', 'Joist',                     'Materials',     3,  true),
  ('04', 'Deck',                      'Materials',     4,  true),
  ('05', 'Raw Material',              'Materials',     5,  true),
  ('06', 'Shop Labor and Fabrication','Labor',         6,  true),
  ('07', 'Field Labor - Structural',  'Labor',         7,  true),
  ('08', 'Field Labor - Misc.',       'Labor',         8,  true),
  ('09', 'Equipment',                 'Equipment',     9,  true),
  ('10', 'Shipping',                  'Labor',         10, true),
  ('11', 'Deck Install',              'Subcontractor', 11, true),
  ('12', 'Special Coatings',          'Misc.',         12, true),
  ('13', 'Misc.',                     'Misc.',         13, true),
  ('14', 'PM/Admin',                  'Overhead',      14, true)
ON CONFLICT (cost_code_number) DO NOTHING;

NOTIFY pgrst, 'reload schema';
