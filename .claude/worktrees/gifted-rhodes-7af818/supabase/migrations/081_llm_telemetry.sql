-- 081_llm_telemetry.sql
--
-- LLM Gateway Phase 1 telemetry table.
--
-- Captures one row per llm-proxy call so we can answer:
--   * Cost per use case / project / day
--   * P50/P95 latency by provider+model
--   * Error rate (success=false) and dominant error_kind by use case
--
-- Phase 2 will read this table to make informed per-use-case provider
-- routing decisions (e.g. switch sheet-extraction to Gemini Flash if
-- input-token volume is high).
--
-- Inserts are performed by the edge function under the service role,
-- which bypasses RLS — so we only need a SELECT policy. Admins can read
-- aggregates; everyone else gets nothing.

CREATE TABLE IF NOT EXISTS public.llm_telemetry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  use_case        text NOT NULL DEFAULT 'general',
  provider        text NOT NULL,
  model           text NOT NULL,
  user_id         uuid,
  project_id      uuid,
  input_tokens    integer,
  output_tokens   integer,
  cost_usd        numeric(12, 6),
  latency_ms      integer,
  success         boolean NOT NULL DEFAULT true,
  error_kind      text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_llm_telemetry_use_case
  ON public.llm_telemetry(use_case, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_telemetry_provider
  ON public.llm_telemetry(provider, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_telemetry_project
  ON public.llm_telemetry(project_id, occurred_at DESC)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.llm_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS llm_telemetry_select ON public.llm_telemetry;
CREATE POLICY llm_telemetry_select ON public.llm_telemetry
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid() AND user_profiles.role = 'admin'
    )
  );
