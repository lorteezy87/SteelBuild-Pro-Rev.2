-- ============================================================================
-- drawing_markups v2 — collaborative, attributed, per-row redlining
-- ============================================================================
-- The original drawing_markups table (pin-style: page_x/page_y + comment,
-- revision-bound, unused — 0 rows) becomes the storage for the viewer's
-- vector markup (pen/rect/highlight/arrow/measure/note/cloud/stamp), replacing
-- drawings.markup JSONB (also empty everywhere). One row per markup item makes
-- concurrent redlining safe (no whole-array last-writer-wins) and gives every
-- mark an author + timestamp.
--   kind       -> existing markup_type column
--   pdf_page   -> existing page_number column
--   text       -> existing comment column
--   geometry + tool extras -> new payload jsonb
-- drawing_revision_id becomes NULLABLE and records which revision the mark
-- was drawn on (chain of custody across slip-sheets); drawing_id is the
-- viewer's lookup key.

alter table public.drawing_markups
  add column if not exists drawing_id uuid references public.drawings(id) on delete cascade,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists color text,
  add column if not exists author_email text,
  add column if not exists author_name text;

alter table public.drawing_markups alter column drawing_revision_id drop not null;

create index if not exists idx_drawing_markups_drawing on public.drawing_markups (drawing_id);
create index if not exists idx_drawing_markups_project on public.drawing_markups (project_id);

-- Writes: any member >= field can add marks; only the author (or a PM/admin)
-- can edit or remove a mark. SELECT stays membership-wide.
drop policy if exists project_select on public.drawing_markups;
drop policy if exists project_insert on public.drawing_markups;
drop policy if exists project_update on public.drawing_markups;
drop policy if exists project_delete on public.drawing_markups;
create policy project_select on public.drawing_markups for select to authenticated
  using (user_has_project_access(project_id));
create policy project_insert on public.drawing_markups for insert to authenticated
  with check (
    user_has_project_role_at_least(project_id, 'field')
    and (author_id is null or author_id = auth.uid())
  );
create policy project_update on public.drawing_markups for update to authenticated
  using (
    user_has_project_role_at_least(project_id, 'field')
    and (author_id = auth.uid() or user_has_project_role_at_least(project_id, 'pm'))
  )
  with check (user_has_project_role_at_least(project_id, 'field'));
create policy project_delete on public.drawing_markups for delete to authenticated
  using (
    user_has_project_role_at_least(project_id, 'field')
    and (author_id = auth.uid() or user_has_project_role_at_least(project_id, 'pm'))
  );

-- ============================================================================
-- Realtime: the supabase_realtime publication was EMPTY, so every
-- useRealtimeInvalidation postgres_changes subscription in the app received
-- nothing. Add drawing_markups (concurrent redlining) plus every table the
-- app actually subscribes to. postgres_changes respects RLS, so this exposes
-- no extra data.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'drawing_markups',
    'rfis','change_orders','sov_items','cost_codes','action_items','daily_logs',
    'schedule_tasks','work_packages','deliveries','punchlist_items','inspections',
    'safety_incidents','alerts','email_messages','email_attachments'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_table then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
