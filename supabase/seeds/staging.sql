-- Staging fixture — a minimal, signed-in-able steel project.
--
-- NOT WIRED IN YET. config.toml declares only [db.seed] with
-- sql_paths = ["./seed.sql"]; there is no [remotes.staging.db.seed] section, so
-- nothing runs this file today. Wiring it in needs that section AND the
-- persistent staging branch to exist, which is a Supabase CLI step nobody has
-- run. An earlier version of this header claimed the file was already wired
-- into the branch deployment DAG -- it was not, and a comment asserting
-- behaviour the config does not have is how a reader concludes this fixture is
-- covered when it is untested.
--
-- Once it IS wired in it becomes step 6 of the branch deployment DAG
-- (Clone → Pull → Health → Configure → Migrate → Seed → Deploy), where a
-- failure fails the whole branch build -- so every statement below is either
-- idempotent or guarded, and every literal has to satisfy its CHECK the first
-- time. Nothing has executed this end to end against an empty database yet.
--
-- WHY THIS IS NOT A PILE OF INSERTS
-- ---------------------------------
-- This schema's dominant pattern is an atomic-creation RPC plus a BEFORE INSERT
-- guard trigger. The guard tests authorization through auth.uid(), and a seed
-- runs as `postgres` with no JWT — so auth.uid() is NULL and every role check
-- inside those guards fails. That is not theoretical: restoring a project
-- earlier in this repo's history aborted on enforce_work_package_guards for
-- exactly this reason.
--
-- So the fixture does two things differently:
--   1. It sets request.jwt.claims to the fixture user, so the guards VALIDATE
--      the seed rather than being bypassed. If a guard would reject this data
--      from a real user, it rejects it here too — which is the point.
--   2. It goes through create_organization() and create_project() rather than
--      inserting, so the fixture exercises the same path the app uses and picks
--      up the AFTER-insert triggers (user_projects enrolment, cost codes, piece
--      stations, handoff items, setup items).
--
-- Record numbers come from get_next_sequence_number() only. Never derive them
-- here — see the number-sequence rule in CLAUDE.md.

do $seed$
declare
  -- Fixed ids so the fixture is stable across re-seeds and E2E specs can
  -- reference it without a lookup.
  v_user  uuid := '00000000-5eed-4a11-8000-000000000001';
  v_email text := 'staging.pm@steelbuild-pro.invalid';   -- .invalid: RFC 2606, can never receive mail
  v_org   uuid;
  v_proj  uuid;
  v_set   uuid;
  v_sub   uuid;
  v_num   text;
begin
  -- ---------------------------------------------------------------------
  -- GUARD: only ever seed an empty database.
  --
  -- The fixture refuses to run anywhere that already holds real orgs. That
  -- makes it a no-op against production (which has them) and idempotent on a
  -- re-seed of the same branch, without needing to know its own project ref.
  -- ---------------------------------------------------------------------
  if exists (select 1 from public.organizations where coalesce(slug, '') <> 'staging-fixture') then
    raise notice 'staging seed: database already has organizations; skipping fixture';
    return;
  end if;

  if exists (select 1 from public.organizations where slug = 'staging-fixture') then
    raise notice 'staging seed: fixture already present; skipping';
    return;
  end if;

  -- ---------------------------------------------------------------------
  -- 1. The fixture user.
  --
  -- email_confirmed_at is set deliberately: config.toml now has
  -- auth.email.enable_confirmations = true (production parity), so an
  -- unconfirmed user cannot sign in and staging would be unusable.
  --
  -- The AFTER INSERT trigger handle_new_user() creates the user_profiles row,
  -- so it is not inserted here.
  -- ---------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt('staging-only-not-a-secret', extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Staging PM')
  )
  on conflict (id) do nothing;

  -- ---------------------------------------------------------------------
  -- 2. Become that user for the rest of the fixture.
  --
  -- auth.uid() reads request.jwt.claims, so this is what makes the guard
  -- triggers and the SECURITY DEFINER RPCs below see a real caller. `true`
  -- scopes it to this transaction.
  -- ---------------------------------------------------------------------
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user::text, 'role', 'authenticated', 'email', v_email)::text,
    true
  );

  -- ---------------------------------------------------------------------
  -- 3. Org and project, through the RPCs.
  --
  -- create_organization() enrols the caller as 'owner' in
  -- organization_members, which is what create_project()'s
  -- user_is_org_member() check needs. One project stays inside every plan
  -- limit, so plan_project_limit() is not a factor.
  -- ---------------------------------------------------------------------
  v_org := (public.create_organization('S&H Steel (staging)', 'staging-fixture') ->> 'id')::uuid;

  v_proj := (public.create_project(jsonb_build_object(
    'name',                    'STAGING — Warehouse Expansion',
    'project_number',          'STG-0001',
    'org_id',                  v_org::text,
    'client',                  'Fixture Client LLC',
    'general_contractor',      'Fixture GC Inc.',
    'engineer_of_record',      'Fixture Structural Engineers',
    'project_manager',         'Staging PM',
    'contract_type',           'Lump Sum',
    'original_contract_value', '1850000',
    'start_date',              (current_date - 30)::text,
    'target_completion_date',  (current_date + 120)::text,
    'phase',                   'Detailing',
    'address',                 '1 Fixture Way, Phoenix, AZ'
  )) ->> 'id')::uuid;

  -- ---------------------------------------------------------------------
  -- 4. One drawing set, left UNLOCKED.
  --
  -- guard_drawing_set_lock_for_drawings() rejects any write to drawings whose
  -- parent set is locked, so a locked set here would make the sheet inserts
  -- below fail. There is no create_drawing_set() RPC, so this is a direct
  -- insert. project_id is its only NOT NULL column without a default; note the
  -- name column is set_name, and category/register are NOT NULL but defaulted.
  -- ---------------------------------------------------------------------
  -- `category` is set explicitly. It is NOT NULL but defaults to 'shop', so a
  -- set named "Erection Drawings" would have been categorised as shop drawings
  -- and found by nothing filtering for erection. Allowed: shop / field /
  -- erection. `register` keeps its 'shop' default -- that column is whose
  -- register this is (ours vs the GC's), not what kind of drawings they are.
  insert into public.drawing_sets (project_id, set_name, description, discipline, category, is_locked)
  values (v_proj, 'STG Erection Drawings — Area A', 'Staging fixture set', 'Structural', 'erection', false)
  returning id into v_set;

  -- `stage` is deliberately NOT set, for the same reason the submittal's status
  -- below is not: it is workflow state, and the schema's own default
  -- ('Not Started') is the truthful value for sheets nobody has submitted yet.
  --
  -- It previously hand-wrote 'Detailing', which chk_drawings_stage rejects --
  -- the stage vocabulary is Not Started / IFA / OFA / BFA / OFS / IFC /
  -- Released, and "Detailing" is a PROJECT PHASE, not a drawing stage. Because
  -- every statement here runs inside one DO block, that one bad value aborted
  -- the whole fixture and rolled back the user, organization and project with
  -- it, so the first real branch deployment would have failed outright.
  insert into public.drawings (project_id, drawing_set_id, sheet_number, title)
  values
    (v_proj, v_set, 'E-101', 'Anchor Bolt Plan'),
    (v_proj, v_set, 'E-102', 'Column Schedule'),
    (v_proj, v_set, 'E-201', 'Framing Plan — Level 2');

  -- ---------------------------------------------------------------------
  -- 5. One submittal, numbered through the RPC.
  --
  -- submittals requires project_id, submittal_number and title. It also has
  -- FOUR BEFORE triggers (status-on-insert, status-transition, workflow gates,
  -- fab-release gate), so the status left here is the schema's own default —
  -- advancing it to IFC/Released is a workflow transition, not an insert, and
  -- belongs in a test rather than a fixture.
  -- ---------------------------------------------------------------------
  -- The set link is an ARRAY on the submittal (submittals.drawing_set_ids), with
  -- drawing_sets.current_submittal_id pointing back. Both sides are set so the
  -- fixture matches what the app reads — one submittal per set, per the
  -- set-per-revision model in CLAUDE.md.
  --
  -- 'submittal' is a real record_type in number_sequences, verified against
  -- production alongside RFI / CO / SOV / wp_number / transmittal.
  v_num := public.get_next_sequence_number(v_proj, 'submittal');

  insert into public.submittals (project_id, submittal_number, title, drawing_set_ids)
  values (v_proj, v_num, 'Erection Drawings — Area A', array[v_set])
  returning id into v_sub;

  update public.drawing_sets set current_submittal_id = v_sub where id = v_set;

  raise notice 'staging seed: org % project % set % submittal %', v_org, v_proj, v_set, v_num;
end
$seed$;
