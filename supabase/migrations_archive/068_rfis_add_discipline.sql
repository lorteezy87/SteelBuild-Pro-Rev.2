-- Add discipline column to rfis (Structural, Connections, Misc Metals, Anchor Bolts)
ALTER TABLE public.rfis
  ADD COLUMN IF NOT EXISTS discipline text;
