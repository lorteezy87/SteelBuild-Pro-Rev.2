### Task 1: Add the schedule execution-readiness contract

**Files:**
- Create: `supabase/migrations/20260802091000_schedule_task_readiness.sql`
- Create: `supabase/migrations/__tests__/scheduleTaskReadiness.test.js`
- Modify: `src/types/supabase.ts`

- [ ] **Write a failing static migration contract test**

```js
it('protects schedule readiness by project membership and immutable identity', () => {
  const sql = readMigration('20260802091000_schedule_task_readiness.sql')
  expect(sql).toMatch(/create table[^;]+schedule_task_readiness/is)
  expect(sql).toContain("user_has_project_role_at_least(project_id, 'field')")
  expect(sql).toMatch(/unique\s*\(schedule_task_id\)/i)
  expect(sql).toMatch(/check\s*\(readiness_state in \('not_started','blocked','at_risk','ready','not_applicable'\)\)/i)
})
```

- [ ] **Run it and verify it fails because the migration is absent**

Run: `npx vitest run supabase/migrations/__tests__/scheduleTaskReadiness.test.js`

- [ ] **Create the table, indexes, timestamps, and RLS policies**

```sql
create table public.schedule_task_readiness (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  schedule_task_id uuid not null references public.schedule_tasks(id) on delete cascade,
  readiness_state text not null default 'not_started'
    check (readiness_state in ('not_started','blocked','at_risk','ready','not_applicable')),
  materials_ready boolean not null default false,
  drawings_ready boolean not null default false,
  access_ready boolean not null default false,
  crew_ready boolean not null default false,
  tools_ready boolean not null default false,
  prior_work_ready boolean not null default false,
  blocker_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (schedule_task_id)
);
```

The migration must add a trigger that rejects a `project_id` different from the linked `schedule_tasks.project_id`, apply the repository's timestamp trigger pattern, enable RLS, permit project-member reads, and restrict insert/update to `user_has_project_role_at_least(project_id, 'field')`. Add a planner audit event for every changed check/state without copying sensitive free text into event metadata.

- [ ] **Update the generated database contract using the repository's established type-generation shape**

Add `schedule_task_readiness` row/insert/update/relationship types and do not hand-wave fields as `any`.

- [ ] **Run the focused migration tests**

Run: `npx vitest run supabase/migrations/__tests__/scheduleTaskReadiness.test.js supabase/migrations/__tests__/plannerActionControl.test.js`

---
