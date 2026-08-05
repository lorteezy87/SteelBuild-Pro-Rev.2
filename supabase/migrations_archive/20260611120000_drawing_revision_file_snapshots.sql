-- Per-sheet slip-sheeting history: a drawing_revisions row must be able to
-- point at the exact PDF (+ page) that revision shipped as, so superseded
-- revisions stay downloadable/comparable after the drawings row is updated
-- in place by a revision upload. file_id (uuid) predates this and stays;
-- file_url/pdf_page mirror the drawings columns the revision-upload flow
-- already writes.

alter table public.drawing_revisions
  add column if not exists file_url text,
  add column if not exists pdf_page integer,
  add column if not exists revision_notes text;

comment on column public.drawing_revisions.file_url is
  'Storage URL (or bucket-prefixed path) of the master PDF this revision shipped in. Snapshotted at supersede time.';
comment on column public.drawing_revisions.pdf_page is
  '1-based page within file_url where this sheet revision lives.';
comment on column public.drawing_revisions.revision_notes is
  'What changed in this revision (from the revision upload form).';

notify pgrst, 'reload schema';
