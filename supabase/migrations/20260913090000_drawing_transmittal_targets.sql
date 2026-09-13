-- Keep the checked-in schema aligned with the live transmittal attachment
-- target model. Existing revision-backed rows are backfilled to their drawing.

alter table public.drawing_transmittal_items
  add column if not exists drawing_id uuid,
  add column if not exists gc_drawing_id uuid;

alter table public.drawing_transmittal_items
  alter column drawing_revision_id drop not null;

update public.drawing_transmittal_items as item
set drawing_id = revision.drawing_id
from public.drawing_revisions as revision
where revision.id = item.drawing_revision_id
  and item.drawing_id is null
  and item.gc_drawing_id is null;

alter table public.drawing_transmittal_items
  drop constraint if exists drawing_transmittal_items_drawing_id_fkey,
  add constraint drawing_transmittal_items_drawing_id_fkey
    foreign key (drawing_id)
    references public.drawings(id)
    on delete cascade;

alter table public.drawing_transmittal_items
  drop constraint if exists drawing_transmittal_items_one_target,
  add constraint drawing_transmittal_items_one_target
    check (num_nonnulls(drawing_id, gc_drawing_id) = 1)
    not valid;

alter table public.drawing_transmittal_items
  validate constraint drawing_transmittal_items_one_target;

create index if not exists idx_drawing_transmittal_items_drawing_id
  on public.drawing_transmittal_items (drawing_id);

create index if not exists idx_drawing_transmittal_items_gc_drawing_id
  on public.drawing_transmittal_items (gc_drawing_id);

notify pgrst, 'reload schema';
