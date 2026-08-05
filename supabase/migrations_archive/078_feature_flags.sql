-- 078_feature_flags.sql
-- Lightweight homegrown feature-flag table for SteelBuild Pro.
--
-- Single-org app, so we don't need LaunchDarkly. Flags are read by every
-- authenticated user; toggles are gated client-side via useAppSecurity().
-- isAdmin in the admin UI. RLS is permissive on read/write for authenticated
-- users (we don't yet have DB-enforced roles — that's a separate sprint).
--
-- `user_overrides` is a JSON map { "email": boolean } that takes precedence
-- over `enabled` when the current user matches — handy for opt-in betas
-- without flipping the global flag.

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key        TEXT UNIQUE NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT FALSE,
  description     TEXT,
  user_overrides  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key
  ON public.feature_flags(flag_key);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_select ON public.feature_flags;
CREATE POLICY feature_flags_select ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS feature_flags_write ON public.feature_flags;
CREATE POLICY feature_flags_write ON public.feature_flags
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated-at trigger using the existing repo-wide helper from 001.
DROP TRIGGER IF EXISTS set_updated_at_feature_flags ON public.feature_flags;
CREATE TRIGGER set_updated_at_feature_flags
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
