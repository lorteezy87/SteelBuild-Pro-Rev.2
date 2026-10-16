-- FIXTURE-ONLY ARCHIVAL RECOVERY. Never install in an application database.
-- Input: one pg_temp.drawing_recovery_input(envelope jsonb, remaps jsonb) row.
-- Run inside the harness transaction, which verified the database was empty
-- before initializing synthetic fixtures. No requests, approvals or live source
-- observations are written; imported identities remain explicit provenance.
-- Markers are trusted operator/harness assertions, not hosted authorization.
-- inet_server_addr() is the server interface (possibly a container bridge),
-- not the client URL whose loopback target the harness validated.
DO $$
BEGIN
  IF current_database()<>'steelbuild_drawing_upload_test'
    OR coalesce(current_setting('drawing_recovery.client_loopback_verified',true),'')<>'yes'
    OR coalesce(current_setting('drawing_recovery.empty_fixture_verified',true),'')<>'yes'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper) THEN
    RAISE EXCEPTION 'Archival recovery requires the exact empty disposable loopback fixture database';
  END IF;
  IF to_regnamespace('drawing_observation_recovery') IS NOT NULL THEN
    RAISE EXCEPTION 'Archival recovery destination must be empty';
  END IF;
END $$;

CREATE SCHEMA drawing_observation_recovery;
REVOKE ALL ON SCHEMA drawing_observation_recovery FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE drawing_observation_recovery.remaps(
  kind text NOT NULL CHECK(kind IN ('project','set','drawing')),
  original_id uuid NOT NULL, destination_id uuid NOT NULL,
  PRIMARY KEY(kind,original_id), UNIQUE(kind,destination_id)
);
CREATE TABLE drawing_observation_recovery.observations(
  original_receipt_id uuid NOT NULL, original_drawing_id uuid NOT NULL,
  original_project_id uuid NOT NULL, original_set_id uuid NOT NULL,
  destination_project_id uuid NOT NULL, destination_set_id uuid NOT NULL, destination_drawing_id uuid NOT NULL,
  original_observation jsonb NOT NULL, snapshot_token text NOT NULL,
  callouts jsonb, callouts_is_sql_null boolean NOT NULL,
  recovered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(original_receipt_id,original_drawing_id),
  CHECK((callouts IS NULL)=callouts_is_sql_null)
);
ALTER TABLE drawing_observation_recovery.remaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_observation_recovery.observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA drawing_observation_recovery FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE e jsonb; ext jsonb; maps jsonb; o jsonb; m jsonb; original_project uuid;
  dest_project uuid; dest_set uuid; dest_drawing uuid; expected_keys text[]:=ARRAY[
    'receipt_id','drawing_id','project_id','drawing_set_id','parent_file_url','parent_pdf_page',
    'parent_revision_number','parent_updated_at','observed_current_revision_id',
    'observed_current_revision_version','extracted_text','callouts','recorded_at','callouts_is_sql_null'];
  k text;
BEGIN
  IF (SELECT count(*) FROM pg_temp.drawing_recovery_input)<>1 THEN RAISE EXCEPTION 'One recovery input required'; END IF;
  SELECT envelope,remaps INTO e,maps FROM pg_temp.drawing_recovery_input;
  ext:=e#>'{extensions,drawing_evidence}';
  IF e->'export_version' IS DISTINCT FROM '2'::jsonb OR ext->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(ext->'observations') IS DISTINCT FROM 'array'
    OR jsonb_typeof(ext->'snapshot_token') IS DISTINCT FROM 'string'
    OR (ext->>'snapshot_token') !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(maps) IS DISTINCT FROM 'array'
    OR jsonb_typeof(e#>'{tables,drawings}') IS DISTINCT FROM 'array'
    OR jsonb_typeof(e#>'{tables,drawing_sets}') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid drawing evidence extension or relationship roster';
  END IF;
  original_project:=(e#>>'{project,id}')::uuid;
  IF original_project IS NULL THEN RAISE EXCEPTION 'Original project required'; END IF;
  FOR m IN SELECT value FROM jsonb_array_elements(maps) LOOP
    IF jsonb_typeof(m) IS DISTINCT FROM 'object' OR NOT m ?& ARRAY['kind','original_id','destination_id']
      OR (SELECT count(*) FROM jsonb_object_keys(m))<>3 THEN RAISE EXCEPTION 'Invalid remap'; END IF;
    INSERT INTO drawing_observation_recovery.remaps VALUES(m->>'kind',(m->>'original_id')::uuid,(m->>'destination_id')::uuid);
  END LOOP;
  SELECT destination_id INTO dest_project FROM drawing_observation_recovery.remaps WHERE kind='project' AND original_id=original_project;
  IF dest_project IS NULL OR NOT EXISTS(SELECT 1 FROM public.projects WHERE id=dest_project) THEN RAISE EXCEPTION 'Destination project missing'; END IF;
  FOR o IN SELECT value FROM jsonb_array_elements(ext->'observations') LOOP
    IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR NOT o ?& expected_keys
      OR (SELECT count(*) FROM jsonb_object_keys(o))<>cardinality(expected_keys)
      OR jsonb_typeof(o->'callouts_is_sql_null') IS DISTINCT FROM 'boolean'
      OR (o->>'callouts_is_sql_null')::boolean AND o->'callouts' IS DISTINCT FROM 'null'::jsonb THEN
      RAISE EXCEPTION 'Invalid observation columns or null distinction';
    END IF;
    FOREACH k IN ARRAY ARRAY['receipt_id','drawing_id','project_id','drawing_set_id'] LOOP
      IF jsonb_typeof(o->k) IS DISTINCT FROM 'string' OR (o->>k)::uuid IS NULL THEN RAISE EXCEPTION 'Observation UUID required'; END IF;
    END LOOP;
    IF (o->>'project_id')::uuid<>original_project THEN RAISE EXCEPTION 'Foreign observation'; END IF;
    FOREACH k IN ARRAY ARRAY['parent_file_url','parent_revision_number','extracted_text','parent_updated_at','observed_current_revision_id'] LOOP
      IF jsonb_typeof(o->k) NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid nullable observation text'; END IF;
    END LOOP;
    FOREACH k IN ARRAY ARRAY['parent_pdf_page','observed_current_revision_version'] LOOP
      IF jsonb_typeof(o->k) NOT IN ('number','null') THEN RAISE EXCEPTION 'Invalid nullable observation number'; END IF;
      PERFORM (o->>k)::integer;
    END LOOP;
    IF jsonb_typeof(o->'recorded_at') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Recorded timestamp required'; END IF;
    PERFORM (o->>'recorded_at')::timestamptz,(o->>'parent_updated_at')::timestamptz,(o->>'observed_current_revision_id')::uuid;
    SELECT destination_id INTO dest_set FROM drawing_observation_recovery.remaps WHERE kind='set' AND original_id=(o->>'drawing_set_id')::uuid;
    SELECT destination_id INTO dest_drawing FROM drawing_observation_recovery.remaps WHERE kind='drawing' AND original_id=(o->>'drawing_id')::uuid;
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e#>'{tables,drawing_sets}') s
        WHERE s->>'id'=o->>'drawing_set_id' AND s->>'project_id'=original_project::text)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e#>'{tables,drawings}') d
        WHERE d->>'id'=o->>'drawing_id' AND d->>'drawing_set_id'=o->>'drawing_set_id' AND d->>'project_id'=original_project::text)
      OR NOT EXISTS(SELECT 1 FROM public.drawing_sets WHERE id=dest_set AND project_id=dest_project)
      OR NOT EXISTS(SELECT 1 FROM public.drawings WHERE id=dest_drawing AND drawing_set_id=dest_set AND project_id=dest_project) THEN
      RAISE EXCEPTION 'Observation relationship or remap mismatch';
    END IF;
    INSERT INTO drawing_observation_recovery.observations VALUES(
      (o->>'receipt_id')::uuid,(o->>'drawing_id')::uuid,original_project,(o->>'drawing_set_id')::uuid,
      dest_project,dest_set,dest_drawing,o,ext->>'snapshot_token',
      CASE WHEN (o->>'callouts_is_sql_null')::boolean THEN NULL ELSE o->'callouts' END,
      (o->>'callouts_is_sql_null')::boolean,clock_timestamp());
  END LOOP;
  IF ext->>'snapshot_token' IS DISTINCT FROM (
    SELECT encode(sha256(convert_to(original_project::text||':'||coalesce(
      string_agg(original_receipt_id::text||':'||original_drawing_id::text,',' ORDER BY original_receipt_id,original_drawing_id),''),'UTF8')),'hex')
    FROM drawing_observation_recovery.observations
  ) THEN RAISE EXCEPTION 'Recovery identity roster does not match export snapshot token'; END IF;
END $$;
