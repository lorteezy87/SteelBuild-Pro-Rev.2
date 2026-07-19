alter table public.drawing_revision_deltas
  add column if not exists change_category text
    check (change_category in ('A','B','C')),
  add column if not exists likely_owner text,
  add column if not exists impact_summary text,
  add column if not exists classification_confidence text
    check (classification_confidence in ('high','medium','low')),
  add column if not exists classification_source text
    check (classification_source in ('deterministic','ai','manual'));

notify pgrst, 'reload schema';
