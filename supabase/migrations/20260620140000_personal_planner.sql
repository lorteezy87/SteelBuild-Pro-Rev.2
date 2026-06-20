-- Personal Planner (Motion-style) — Phase 1 foundation.
--
-- Adds the personal-planner fields to action_items and meetings so the
-- planner can answer "what should I personally work on this week across
-- every job." Drawings/CPM (schedule_tasks) are intentionally NOT touched —
-- the planner rides on action_items, which already models cross-project,
-- assignable, Open/In Progress/Complete work.
--
-- RLS: no new policies. Both tables are already RLS-enabled and project-scoped
-- through user_projects; the new columns inherit the existing policies. Planner
-- reads add `where assigned_user_id = (select auth.uid())`.

-- 1. action_items: personal-planner fields ----------------------------------
alter table public.action_items
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null,
  add column if not exists estimated_hours  numeric,
  add column if not exists subtasks         jsonb not null default '[]'::jsonb,
  add column if not exists planner_included boolean not null default true;

-- Index the new FK (consistent with the unindexed-FK audit).
create index if not exists idx_action_items_assigned_user_id
  on public.action_items (assigned_user_id);

-- Composite index for the hot planner query (my open work, by due date).
-- NOTE: action_items has NO is_deleted column (only meetings does), so unlike
-- the original spec this index has no `where is_deleted = false` predicate.
create index if not exists idx_action_items_planner
  on public.action_items (assigned_user_id, status, due_date);

-- 2. meetings: fixed time blocks for slot-busy logic ------------------------
alter table public.meetings
  add column if not exists start_time time,
  add column if not exists end_time   time,
  add column if not exists assigned_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_meetings_assigned_user_id
  on public.meetings (assigned_user_id);

-- 3. Backfill assigned_user_id from the free-text assigned_to --------------
-- Conservative, UNAMBIGUOUS name match only: a task is linked to a user only
-- when its assigned_to text resolves to exactly one user_profiles.full_name
-- (case-insensitive, trimmed). Ambiguous or unmatched names stay null — those
-- tasks simply won't appear in anyone's personal plan until reassigned.
update public.action_items ai
set assigned_user_id = m.uid
from (
  select lower(trim(full_name)) as name_key, max(id) as uid
  from public.user_profiles
  where full_name is not null and trim(full_name) <> ''
  group by lower(trim(full_name))
  having count(*) = 1
) m
where ai.assigned_user_id is null
  and ai.assigned_to is not null
  and lower(trim(ai.assigned_to)) = m.name_key;

-- 4. Feature flag — ship dark (disabled by default) ------------------------
insert into public.feature_flags (flag_key, enabled, description)
values ('planner_enabled', false, 'Personal Planner (Motion-style) — cross-project "what do I work on this week" view over action_items.')
on conflict (flag_key) do nothing;

-- Reload PostgREST so the new columns are exposed to the API immediately.
notify pgrst, 'reload schema';
