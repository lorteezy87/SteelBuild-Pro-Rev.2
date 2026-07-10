-- Phase identification on field activity records.
--
-- The four field registers (punchlist_items, inspections, safety_incidents,
-- daily_logs) had no way to record which project phase an activity belongs to,
-- so the Field Hub activity feed could not identify or filter by phase.
-- schedule_tasks already carries `phase`; this brings the registers to parity.
--
-- Nullable on purpose. Existing rows stay NULL, and the UI falls back to a
-- derived phase (src/lib/field/fieldPhase.js), rendering it visibly as a guess.
-- Daily logs additionally resolve a real phase from their linked schedule tasks
-- via daily_logs.schedule_task_ids. Once a user sets `phase` explicitly, the
-- stored value wins — resolveFieldPhase already prefers it.
--
-- Vocabulary matches src/utils/phases.js PHASES. 'Erection' and 'Installation'
-- are aliases for the same field-execution phase and BOTH are live in
-- production (schedule_tasks holds 96 'Installation' and 13 'Erection' rows,
-- projects holds 6 'Erection'), so the CHECK accepts both rather than forcing
-- a data migration. The UI canonicalizes to 'Erection' for display.
--
-- No RLS change: these are columns on tables that already have per-role
-- policies, and the existing policies are column-agnostic.

alter table public.punchlist_items  add column if not exists phase text;
alter table public.inspections      add column if not exists phase text;
alter table public.safety_incidents add column if not exists phase text;
alter table public.daily_logs       add column if not exists phase text;

alter table public.punchlist_items
  drop constraint if exists chk_punchlist_items_phase,
  add constraint chk_punchlist_items_phase check (
    phase is null or phase in (
      'Pre-Construction','Detailing','Procurement','Fabrication',
      'Delivery','Erection','Installation','Closeout'
    )
  );

alter table public.inspections
  drop constraint if exists chk_inspections_phase,
  add constraint chk_inspections_phase check (
    phase is null or phase in (
      'Pre-Construction','Detailing','Procurement','Fabrication',
      'Delivery','Erection','Installation','Closeout'
    )
  );

alter table public.safety_incidents
  drop constraint if exists chk_safety_incidents_phase,
  add constraint chk_safety_incidents_phase check (
    phase is null or phase in (
      'Pre-Construction','Detailing','Procurement','Fabrication',
      'Delivery','Erection','Installation','Closeout'
    )
  );

alter table public.daily_logs
  drop constraint if exists chk_daily_logs_phase,
  add constraint chk_daily_logs_phase check (
    phase is null or phase in (
      'Pre-Construction','Detailing','Procurement','Fabrication',
      'Delivery','Erection','Installation','Closeout'
    )
  );

comment on column public.punchlist_items.phase  is 'Project phase this item belongs to. NULL = derive in the UI. Vocabulary: src/utils/phases.js PHASES.';
comment on column public.inspections.phase      is 'Project phase this inspection belongs to. NULL = derive in the UI.';
comment on column public.safety_incidents.phase is 'Project phase this incident occurred in. NULL = derive in the UI.';
comment on column public.daily_logs.phase       is 'Project phase this log covers. NULL = derive from linked schedule_task_ids.';
