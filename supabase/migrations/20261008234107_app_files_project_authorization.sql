-- LOCAL CANDIDATE, preparation phase. No hosted execution or policy cutover.
-- Follow with reviewed metadata reconciliation, then 20261008234249.
-- Do not derive legacy authorization from uploader, a default project, or a
-- single editable file_url reference. Review all references/bytes ownership.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE private.app_file_scopes (
  object_id uuid PRIMARY KEY,
  object_name text NOT NULL UNIQUE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('project','organization','avatar','quarantine')),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  review_reference text NOT NULL CHECK (length(btrim(review_reference)) >= 8),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope_type='project' AND org_id IS NOT NULL AND project_id IS NOT NULL AND user_id IS NULL) OR
    (scope_type='organization' AND org_id IS NOT NULL AND project_id IS NULL AND user_id IS NULL) OR
    (scope_type='avatar' AND org_id IS NOT NULL AND project_id IS NULL AND user_id IS NOT NULL) OR
    (scope_type='quarantine' AND project_id IS NULL AND user_id IS NULL)
  )
);
COMMENT ON TABLE private.app_file_scopes IS 'Reviewed legacy app-files classification; exact object id and name prevent grants surviving replacement. Quarantine grants no access. No automatic project inference.';
ALTER TABLE private.app_file_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.app_file_scopes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.app_file_scopes TO service_role;
GRANT USAGE ON SCHEMA private TO service_role, authenticated;

-- Strict path parser shared by enforcement and its completeness preflight.
-- Returns NULL for legacy, malformed, or ambiguous names; never raises on UUID
-- casts. Folder structure is exact; clients cannot smuggle encoded separators.
CREATE FUNCTION private.app_file_path_scope(p_name text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  s text[] := string_to_array(p_name, '/');
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF p_name IS NULL OR p_name ~ '[%\\[:cntrl:]]' OR s[1] !~* uuid_pattern
     OR EXISTS (SELECT 1 FROM unnest(s) v WHERE v IN ('','.','..')) THEN RETURN NULL; END IF;
  IF cardinality(s)=5 AND s[2]='projects' AND s[3] ~* uuid_pattern AND s[4]='uploads' THEN
    RETURN jsonb_build_object('scope','project','org',s[1]::uuid,'project',s[3]::uuid);
  ELSIF cardinality(s)=4 AND s[2]='organization' AND s[3]='uploads' THEN
    RETURN jsonb_build_object('scope','organization','org',s[1]::uuid);
  ELSIF cardinality(s)=5 AND s[2]='users' AND s[3] ~* uuid_pattern AND s[4]='avatars' THEN
    RETURN jsonb_build_object('scope','avatar','org',s[1]::uuid,'user',s[3]::uuid);
  END IF;
  RETURN NULL;
END;
$$;

-- SECURITY DEFINER is limited to a boolean authorization result for auth.uid().
-- It reads private review records and current membership behind their RLS;
-- it cannot return another caller's paths or metadata. Never accepts user id.
CREATE FUNCTION private.app_file_can_access(p_object_id uuid, p_name text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  parsed jsonb;
  scope_kind text;
  scope_org uuid;
  scope_project uuid;
  scope_user uuid;
  project_archived boolean;
BEGIN
  IF caller_id IS NULL OR p_write IS NULL THEN RETURN false; END IF;
  -- Reviewed quarantine overrides even a canonical-looking path. Existing
  -- objects can predate this contract and cannot self-certify their scope.
  IF EXISTS (SELECT 1 FROM private.app_file_scopes s WHERE s.object_id=p_object_id
    AND s.object_name=p_name AND s.scope_type='quarantine') THEN RETURN false; END IF;
  -- Old flat uploads remain closed, including if a mistaken review row exists.
  IF split_part(p_name,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  parsed := private.app_file_path_scope(p_name);
  IF parsed IS NOT NULL THEN
    scope_kind := parsed->>'scope'; scope_org := (parsed->>'org')::uuid;
    scope_project := (parsed->>'project')::uuid; scope_user := (parsed->>'user')::uuid;
  ELSE
    SELECT s.scope_type, s.org_id, s.project_id, s.user_id
      INTO scope_kind, scope_org, scope_project, scope_user
      FROM private.app_file_scopes s
     WHERE s.object_id=p_object_id AND s.object_name=p_name;
    IF NOT FOUND OR scope_kind='quarantine' OR split_part(p_name,'/',1)::uuid IS DISTINCT FROM scope_org THEN RETURN false; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.org_id=scope_org AND m.user_id=caller_id) THEN RETURN false; END IF;
  IF scope_kind='project' THEN
    SELECT coalesce(p.is_deleted,false) INTO project_archived
      FROM public.projects p WHERE p.id=scope_project AND p.org_id=scope_org;
    IF NOT FOUND THEN RETURN false; END IF;
    IF p_write THEN
      RETURN NOT project_archived AND public.user_has_project_role_at_least(scope_project,'field');
    END IF;
    -- Active visibility follows the established resolver. Archived retention
    -- is readable by current project/workspace admins; no archived writes.
    RETURN public.user_has_project_access(scope_project) OR
      (project_archived AND public.user_has_project_role_at_least(scope_project,'admin'));
  ELSIF scope_kind='organization' THEN
    RETURN NOT p_write OR EXISTS (SELECT 1 FROM public.organization_members m
      WHERE m.org_id=scope_org AND m.user_id=caller_id AND m.role IN ('owner','admin'));
  ELSIF scope_kind='avatar' THEN
    IF NOT EXISTS (SELECT 1 FROM public.organization_members m WHERE m.org_id=scope_org AND m.user_id=scope_user) THEN RETURN false; END IF;
    IF caller_id=scope_user THEN RETURN true; END IF;
    RETURN NOT p_write AND EXISTS (SELECT 1 FROM public.user_profiles p
      WHERE p.id=scope_user AND p.avatar_url=p_name);
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION private.app_file_path_scope(text), private.app_file_can_access(uuid,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.app_file_can_access(uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.app_file_path_scope(text) TO service_role;
COMMIT;
