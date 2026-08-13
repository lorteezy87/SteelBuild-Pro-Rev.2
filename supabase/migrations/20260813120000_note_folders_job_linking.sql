-- Production Notes folders + multi-job linking.
--
-- Folders are org-scoped. A folder may be unlinked (general notes), linked to
-- one project, or linked to many. Subfolders inherit the nearest independent
-- ancestor's links unless a PM/admin sets independent links.
--
-- Access rule (every-job): a user may see a folder only when they currently
-- have access to every project in the folder's effective link set. Unlinked
-- folders are visible to org members. production_notes keep their existing
-- project_id RLS as a second gate so migrated General Notes do not expand
-- who can read a bullet.

BEGIN;

CREATE TABLE IF NOT EXISTS public.note_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_folder_id uuid REFERENCES public.note_folders(id) ON DELETE RESTRICT,
  name text NOT NULL,
  link_mode text NOT NULL DEFAULT 'independent'
    CHECK (link_mode IN ('inherited', 'independent')),
  is_system boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  CONSTRAINT note_folders_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT note_folders_root_independent CHECK (
    parent_folder_id IS NOT NULL OR link_mode = 'independent'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS note_folders_unique_name_per_parent
  ON public.note_folders (
    org_id,
    COALESCE(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS note_folders_one_system_per_org
  ON public.note_folders (org_id)
  WHERE is_system = true AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS note_folders_org_parent_idx
  ON public.note_folders (org_id, parent_folder_id);

COMMENT ON TABLE public.note_folders IS
  'Org-scoped Production Notes folders. Independent folders store job links; inherited folders resolve from the nearest independent ancestor.';

CREATE TABLE IF NOT EXISTS public.note_folder_job_links (
  folder_id uuid NOT NULL REFERENCES public.note_folders(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, project_id)
);

CREATE INDEX IF NOT EXISTS note_folder_job_links_project_idx
  ON public.note_folder_job_links (project_id);

COMMENT ON TABLE public.note_folder_job_links IS
  'Direct job links. Only independently linked folders store rows here.';

CREATE TABLE IF NOT EXISTS public.note_folder_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  folder_id uuid,
  actor_id uuid,
  action text NOT NULL,
  accepted boolean NOT NULL,
  error_code text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS note_folder_audit_events_org_idx
  ON public.note_folder_audit_events (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.note_folder_mutation_receipts (
  idempotency_key text PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  command text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.note_folder_migrations (
  org_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  general_notes_id uuid NOT NULL REFERENCES public.note_folders(id),
  notes_before integer NOT NULL,
  notes_after integer NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.production_notes
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.note_folders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_production_notes_folder_id
  ON public.production_notes (folder_id);

CREATE OR REPLACE FUNCTION public.user_is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.user_is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.org_id = p_org_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.note_folder_effective_project_ids(p_folder_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current public.note_folders%ROWTYPE;
  v_guard integer := 0;
BEGIN
  SELECT * INTO v_current FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  WHILE v_current.link_mode = 'inherited' AND v_current.parent_folder_id IS NOT NULL LOOP
    v_guard := v_guard + 1;
    IF v_guard > 32 THEN
      RETURN ARRAY[]::uuid[];
    END IF;
    SELECT * INTO v_current FROM public.note_folders WHERE id = v_current.parent_folder_id;
    IF NOT FOUND THEN
      RETURN ARRAY[]::uuid[];
    END IF;
  END LOOP;

  RETURN COALESCE(
    ARRAY(
      SELECT nfl.project_id
      FROM public.note_folder_job_links nfl
      WHERE nfl.folder_id = v_current.id
      ORDER BY nfl.project_id
    ),
    ARRAY[]::uuid[]
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_note_folder(p_folder_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_jobs uuid[];
  v_job uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.note_folders WHERE id = p_folder_id;
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.user_is_org_member(v_org_id) AND NOT public.user_is_system_admin() THEN
    RETURN false;
  END IF;

  v_jobs := public.note_folder_effective_project_ids(p_folder_id);
  IF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
    RETURN true;
  END IF;

  FOREACH v_job IN ARRAY v_jobs LOOP
    IF NOT public.user_has_project_access(v_job) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_manage_note_folder_links(
  p_org_id uuid,
  p_project_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job uuid;
BEGIN
  IF public.user_is_org_admin(p_org_id) THEN
    RETURN true;
  END IF;
  IF coalesce(array_length(p_project_ids, 1), 0) = 0 THEN
    RETURN false;
  END IF;
  FOREACH v_job IN ARRAY p_project_ids LOOP
    IF NOT public.user_has_project_role_at_least(v_job, 'pm') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_can_edit_note_folder(p_folder_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_jobs uuid[];
  v_job uuid;
BEGIN
  IF NOT public.user_can_access_note_folder(p_folder_id) THEN
    RETURN false;
  END IF;
  SELECT org_id INTO v_org_id FROM public.note_folders WHERE id = p_folder_id;
  IF public.user_is_org_admin(v_org_id) THEN
    RETURN true;
  END IF;
  v_jobs := public.note_folder_effective_project_ids(p_folder_id);
  IF coalesce(array_length(v_jobs, 1), 0) = 0 THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.org_id = v_org_id
        AND coalesce(p.is_deleted, false) = false
        AND public.user_has_project_role_at_least(p.id, 'field')
    );
  END IF;
  FOREACH v_job IN ARRAY v_jobs LOOP
    IF NOT public.user_has_project_role_at_least(v_job, 'field') THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.note_folder_visible_payload(p_folder_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_folder public.note_folders%ROWTYPE;
  v_jobs uuid[];
BEGIN
  SELECT * INTO v_folder FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_jobs := public.note_folder_effective_project_ids(p_folder_id);
  RETURN jsonb_build_object(
    'id', v_folder.id,
    'org_id', v_folder.org_id,
    'parent_folder_id', v_folder.parent_folder_id,
    'name', v_folder.name,
    'link_mode', v_folder.link_mode,
    'is_system', v_folder.is_system,
    'version', v_folder.version,
    'created_by', v_folder.created_by,
    'created_at', v_folder.created_at,
    'updated_at', v_folder.updated_at,
    'archived_at', v_folder.archived_at,
    'archived_by', v_folder.archived_by,
    'archive_reason', v_folder.archive_reason,
    'effective_project_ids', to_jsonb(v_jobs),
    'independently_linked', (v_folder.link_mode = 'independent' AND v_folder.parent_folder_id IS NOT NULL),
    'can_manage_links', public.user_can_manage_note_folder_links(
      v_folder.org_id,
      (
        SELECT coalesce(array_agg(x), ARRAY[]::uuid[])
        FROM (
          SELECT unnest(v_jobs) AS x
          UNION
          SELECT nfl.project_id FROM public.note_folder_job_links nfl WHERE nfl.folder_id = v_folder.id
        ) s
      )
    ),
    'can_edit', public.user_can_edit_note_folder(p_folder_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.note_folder_write_audit(
  p_org_id uuid,
  p_folder_id uuid,
  p_action text,
  p_accepted boolean,
  p_error_code text,
  p_before jsonb,
  p_after jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.note_folder_audit_events (
    org_id, folder_id, actor_id, action, accepted, error_code, before_state, after_state, metadata
  ) VALUES (
    p_org_id,
    p_folder_id,
    (SELECT auth.uid()),
    p_action,
    p_accepted,
    p_error_code,
    p_before,
    p_after,
    coalesce(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.note_folder_reject(
  p_org_id uuid,
  p_folder_id uuid,
  p_action text,
  p_code text,
  p_message text,
  p_before jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public.note_folder_write_audit(
    p_org_id, p_folder_id, p_action, false, p_code, p_before, NULL,
    jsonb_build_object('message', p_message)
  );
  RETURN jsonb_build_object(
    'ok', false,
    'error_code', p_code,
    'error_message', p_message,
    'failure_id', v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.note_folder_receipt_get(p_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT result FROM public.note_folder_mutation_receipts WHERE idempotency_key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.note_folder_receipt_put(
  p_key text,
  p_org_id uuid,
  p_command text,
  p_result jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.note_folder_mutation_receipts (idempotency_key, org_id, command, result)
  VALUES (p_key, p_org_id, p_command, p_result)
  ON CONFLICT (idempotency_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.note_folder_same_org_projects(
  p_org_id uuid,
  p_project_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(array_length(p_project_ids, 1), 0) = 0
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p_project_ids) AS pid
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = pid
          AND p.org_id = p_org_id
          AND coalesce(p.is_deleted, false) = false
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.ensure_general_notes_folder(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id
  FROM public.note_folders
  WHERE org_id = p_org_id AND is_system = true AND archived_at IS NULL
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.note_folders (org_id, name, link_mode, is_system, created_by)
  VALUES (p_org_id, 'General Notes', 'independent', true, (SELECT auth.uid()))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_visible_note_folders(
  p_org_id uuid,
  p_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_general uuid;
  v_folders jsonb;
  v_links jsonb;
BEGIN
  IF p_org_id IS NULL OR (NOT public.user_is_org_member(p_org_id) AND NOT public.user_is_system_admin()) THEN
    RETURN public.note_folder_reject(coalesce(p_org_id, '00000000-0000-0000-0000-000000000000'::uuid), NULL, 'list', 'FORBIDDEN', 'Not a member of this workspace');
  END IF;

  v_general := public.ensure_general_notes_folder(p_org_id);

  SELECT coalesce(jsonb_agg(public.note_folder_visible_payload(f.id) ORDER BY f.name), '[]'::jsonb)
  INTO v_folders
  FROM public.note_folders f
  WHERE f.org_id = p_org_id
    AND (p_include_archived OR f.archived_at IS NULL)
    AND public.user_can_access_note_folder(f.id);

  SELECT coalesce(
    jsonb_agg(jsonb_build_object(
      'folder_id', nfl.folder_id,
      'project_id', nfl.project_id,
      'created_by', nfl.created_by,
      'created_at', nfl.created_at
    )),
    '[]'::jsonb
  )
  INTO v_links
  FROM public.note_folder_job_links nfl
  JOIN public.note_folders f ON f.id = nfl.folder_id
  WHERE f.org_id = p_org_id
    AND public.user_can_access_note_folder(f.id);

  RETURN jsonb_build_object(
    'ok', true,
    'folders', v_folders,
    'links', v_links,
    'general_notes_id', v_general
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_note_folder(
  p_org_id uuid,
  p_name text,
  p_parent_folder_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cached jsonb;
  v_id uuid;
  v_mode text;
  v_result jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public.note_folder_receipt_get(p_idempotency_key);
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  END IF;

  IF p_org_id IS NULL OR NOT public.user_is_org_member(p_org_id) THEN
    RETURN public.note_folder_reject(coalesce(p_org_id, '00000000-0000-0000-0000-000000000000'::uuid), NULL, 'create', 'FORBIDDEN', 'Not a member of this workspace');
  END IF;
  IF length(btrim(coalesce(p_name, ''))) = 0 THEN
    RETURN public.note_folder_reject(p_org_id, NULL, 'create', 'INVALID_NAME', 'Folder name is required');
  END IF;
  IF p_parent_folder_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.note_folders
      WHERE id = p_parent_folder_id AND org_id = p_org_id AND archived_at IS NULL
    ) THEN
      RETURN public.note_folder_reject(p_org_id, p_parent_folder_id, 'create', 'NOT_FOUND', 'Parent folder not found');
    END IF;
    IF NOT public.user_can_edit_note_folder(p_parent_folder_id) THEN
      RETURN public.note_folder_reject(p_org_id, p_parent_folder_id, 'create', 'FORBIDDEN', 'Cannot add a subfolder here');
    END IF;
    v_mode := 'inherited';
  ELSE
    IF NOT public.user_can_edit_note_folder(public.ensure_general_notes_folder(p_org_id)) THEN
      RETURN public.note_folder_reject(p_org_id, NULL, 'create', 'FORBIDDEN', 'Cannot create folders in this workspace');
    END IF;
    v_mode := 'independent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.note_folders
    WHERE org_id = p_org_id
      AND archived_at IS NULL
      AND coalesce(parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(p_parent_folder_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND lower(btrim(name)) = lower(btrim(p_name))
  ) THEN
    RETURN public.note_folder_reject(p_org_id, p_parent_folder_id, 'create', 'NAME_CONFLICT', 'A folder with that name already exists here');
  END IF;

  INSERT INTO public.note_folders (org_id, parent_folder_id, name, link_mode, created_by)
  VALUES (p_org_id, p_parent_folder_id, btrim(p_name), v_mode, (SELECT auth.uid()))
  RETURNING id INTO v_id;

  v_result := jsonb_build_object(
    'ok', true,
    'folder', public.note_folder_visible_payload(v_id),
    'version', 1
  );
  PERFORM public.note_folder_write_audit(p_org_id, v_id, 'create', true, NULL, NULL, v_result->'folder');
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.note_folder_receipt_put(p_idempotency_key, p_org_id, 'create', v_result);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.rename_note_folder(
  p_folder_id uuid,
  p_name text,
  p_expected_version integer,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_folder public.note_folders%ROWTYPE;
  v_cached jsonb;
  v_result jsonb;
  v_updated integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public.note_folder_receipt_get(p_idempotency_key);
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  END IF;

  SELECT * INTO v_folder FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN public.note_folder_reject('00000000-0000-0000-0000-000000000000'::uuid, p_folder_id, 'rename', 'NOT_FOUND', 'Folder not found');
  END IF;
  IF v_folder.is_system THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'rename', 'SYSTEM_FOLDER', 'General Notes cannot be renamed', to_jsonb(v_folder));
  END IF;
  IF NOT public.user_can_edit_note_folder(p_folder_id) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'rename', 'FORBIDDEN', 'Cannot rename this folder', to_jsonb(v_folder));
  END IF;
  IF length(btrim(coalesce(p_name, ''))) = 0 THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'rename', 'INVALID_NAME', 'Folder name is required', to_jsonb(v_folder));
  END IF;
  IF v_folder.version <> p_expected_version THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'rename', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  UPDATE public.note_folders
     SET name = btrim(p_name),
         version = version + 1,
         updated_at = now()
   WHERE id = p_folder_id AND version = p_expected_version;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'rename', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'folder', public.note_folder_visible_payload(p_folder_id),
    'version', p_expected_version + 1
  );
  PERFORM public.note_folder_write_audit(v_folder.org_id, p_folder_id, 'rename', true, NULL, to_jsonb(v_folder), v_result->'folder');
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.note_folder_receipt_put(p_idempotency_key, v_folder.org_id, 'rename', v_result);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_note_folder(
  p_folder_id uuid,
  p_parent_folder_id uuid,
  p_expected_version integer,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_folder public.note_folders%ROWTYPE;
  v_cached jsonb;
  v_result jsonb;
  v_walk uuid;
  v_updated integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public.note_folder_receipt_get(p_idempotency_key);
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  END IF;

  SELECT * INTO v_folder FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN public.note_folder_reject('00000000-0000-0000-0000-000000000000'::uuid, p_folder_id, 'move', 'NOT_FOUND', 'Folder not found');
  END IF;
  IF v_folder.is_system THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'SYSTEM_FOLDER', 'General Notes cannot be moved', to_jsonb(v_folder));
  END IF;
  IF NOT public.user_can_edit_note_folder(p_folder_id) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'FORBIDDEN', 'Cannot move this folder', to_jsonb(v_folder));
  END IF;
  IF v_folder.version <> p_expected_version THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;
  IF p_parent_folder_id IS NOT NULL THEN
    IF p_parent_folder_id = p_folder_id THEN
      RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'CYCLE', 'A folder cannot be moved into itself', to_jsonb(v_folder));
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.note_folders
      WHERE id = p_parent_folder_id AND org_id = v_folder.org_id AND archived_at IS NULL
    ) THEN
      RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'NOT_FOUND', 'Target folder not found', to_jsonb(v_folder));
    END IF;
    IF NOT public.user_can_edit_note_folder(p_parent_folder_id) THEN
      RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'FORBIDDEN', 'Cannot move into that folder', to_jsonb(v_folder));
    END IF;
    v_walk := p_parent_folder_id;
    WHILE v_walk IS NOT NULL LOOP
      IF v_walk = p_folder_id THEN
        RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'CYCLE', 'That move would create a folder cycle', to_jsonb(v_folder));
      END IF;
      SELECT parent_folder_id INTO v_walk FROM public.note_folders WHERE id = v_walk;
    END LOOP;
  END IF;

  UPDATE public.note_folders
     SET parent_folder_id = p_parent_folder_id,
         link_mode = CASE WHEN p_parent_folder_id IS NULL THEN 'independent' ELSE link_mode END,
         version = version + 1,
         updated_at = now()
   WHERE id = p_folder_id AND version = p_expected_version;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'move', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'folder', public.note_folder_visible_payload(p_folder_id),
    'version', p_expected_version + 1
  );
  PERFORM public.note_folder_write_audit(v_folder.org_id, p_folder_id, 'move', true, NULL, to_jsonb(v_folder), v_result->'folder');
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.note_folder_receipt_put(p_idempotency_key, v_folder.org_id, 'move', v_result);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_note_folder_links(
  p_folder_id uuid,
  p_project_ids uuid[],
  p_expected_version integer,
  p_make_independent boolean DEFAULT true,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_folder public.note_folders%ROWTYPE;
  v_cached jsonb;
  v_result jsonb;
  v_current uuid[];
  v_union uuid[];
  v_updated integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public.note_folder_receipt_get(p_idempotency_key);
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  END IF;

  SELECT * INTO v_folder FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN public.note_folder_reject('00000000-0000-0000-0000-000000000000'::uuid, p_folder_id, 'set_links', 'NOT_FOUND', 'Folder not found');
  END IF;
  IF v_folder.archived_at IS NOT NULL THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'set_links', 'ARCHIVED', 'Archived folders cannot change job links', to_jsonb(v_folder));
  END IF;
  IF NOT public.user_can_access_note_folder(p_folder_id) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'set_links', 'FORBIDDEN', 'You do not have access to this folder', to_jsonb(v_folder));
  END IF;
  IF v_folder.version <> p_expected_version THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'set_links', 'VERSION_CONFLICT', 'Folder links changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;
  IF NOT public.note_folder_same_org_projects(v_folder.org_id, coalesce(p_project_ids, ARRAY[]::uuid[])) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'set_links', 'CROSS_TENANT', 'Folders can only link to live jobs in this workspace', to_jsonb(v_folder));
  END IF;

  v_current := public.note_folder_effective_project_ids(p_folder_id);
  SELECT coalesce(array_agg(DISTINCT x), ARRAY[]::uuid[])
    INTO v_union
    FROM (
      SELECT unnest(v_current) AS x
      UNION
      SELECT unnest(coalesce(p_project_ids, ARRAY[]::uuid[]))
    ) s;

  IF NOT public.user_can_manage_note_folder_links(v_folder.org_id, v_union)
     AND NOT (
       coalesce(array_length(v_current, 1), 0) = 0
       AND public.user_can_manage_note_folder_links(v_folder.org_id, coalesce(p_project_ids, ARRAY[]::uuid[]))
     ) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'set_links', 'FORBIDDEN', 'Only a project manager or administrator can change job links', to_jsonb(v_folder));
  END IF;

  IF p_make_independent OR v_folder.parent_folder_id IS NULL THEN
    UPDATE public.note_folders
       SET link_mode = 'independent',
           version = version + 1,
           updated_at = now()
     WHERE id = p_folder_id AND version = p_expected_version;
  ELSE
    UPDATE public.note_folders
       SET version = version + 1,
           updated_at = now()
     WHERE id = p_folder_id AND version = p_expected_version;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'set_links', 'VERSION_CONFLICT', 'Folder links changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  DELETE FROM public.note_folder_job_links WHERE folder_id = p_folder_id;
  IF coalesce(array_length(p_project_ids, 1), 0) > 0 THEN
    INSERT INTO public.note_folder_job_links (folder_id, project_id, created_by)
    SELECT p_folder_id, pid, (SELECT auth.uid())
    FROM unnest(p_project_ids) AS pid
    ON CONFLICT DO NOTHING;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'folder', public.note_folder_visible_payload(p_folder_id),
    'version', p_expected_version + 1
  );
  PERFORM public.note_folder_write_audit(
    v_folder.org_id, p_folder_id, 'set_links', true, NULL, to_jsonb(v_folder), v_result->'folder',
    jsonb_build_object('previous_jobs', v_current, 'next_jobs', coalesce(p_project_ids, ARRAY[]::uuid[]))
  );
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.note_folder_receipt_put(p_idempotency_key, v_folder.org_id, 'set_links', v_result);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_note_folder(
  p_folder_id uuid,
  p_expected_version integer,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_folder public.note_folders%ROWTYPE;
  v_cached jsonb;
  v_result jsonb;
  v_updated integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public.note_folder_receipt_get(p_idempotency_key);
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  END IF;

  SELECT * INTO v_folder FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN public.note_folder_reject('00000000-0000-0000-0000-000000000000'::uuid, p_folder_id, 'archive', 'NOT_FOUND', 'Folder not found');
  END IF;
  IF v_folder.is_system THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'archive', 'SYSTEM_FOLDER', 'General Notes cannot be archived', to_jsonb(v_folder));
  END IF;
  IF NOT public.user_can_manage_note_folder_links(
    v_folder.org_id,
    public.note_folder_effective_project_ids(p_folder_id)
  ) AND NOT public.user_is_org_admin(v_folder.org_id) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'archive', 'FORBIDDEN', 'Only a project manager or administrator can archive a folder', to_jsonb(v_folder));
  END IF;
  IF v_folder.version <> p_expected_version THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'archive', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  UPDATE public.note_folders
     SET archived_at = now(),
         archived_by = (SELECT auth.uid()),
         archive_reason = p_reason,
         version = version + 1,
         updated_at = now()
   WHERE id = p_folder_id AND version = p_expected_version AND archived_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'archive', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'folder', public.note_folder_visible_payload(p_folder_id),
    'version', p_expected_version + 1
  );
  PERFORM public.note_folder_write_audit(v_folder.org_id, p_folder_id, 'archive', true, NULL, to_jsonb(v_folder), v_result->'folder');
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.note_folder_receipt_put(p_idempotency_key, v_folder.org_id, 'archive', v_result);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_note_folder(
  p_folder_id uuid,
  p_expected_version integer,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_folder public.note_folders%ROWTYPE;
  v_cached jsonb;
  v_result jsonb;
  v_updated integer;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public.note_folder_receipt_get(p_idempotency_key);
    IF v_cached IS NOT NULL THEN RETURN v_cached; END IF;
  END IF;

  SELECT * INTO v_folder FROM public.note_folders WHERE id = p_folder_id;
  IF NOT FOUND THEN
    RETURN public.note_folder_reject('00000000-0000-0000-0000-000000000000'::uuid, p_folder_id, 'restore', 'NOT_FOUND', 'Folder not found');
  END IF;
  IF NOT public.user_is_org_admin(v_folder.org_id)
     AND NOT public.user_can_manage_note_folder_links(
       v_folder.org_id,
       public.note_folder_effective_project_ids(p_folder_id)
     ) THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'restore', 'FORBIDDEN', 'Only a project manager or administrator can restore a folder', to_jsonb(v_folder));
  END IF;

  UPDATE public.note_folders
     SET archived_at = NULL,
         archived_by = NULL,
         archive_reason = NULL,
         version = version + 1,
         updated_at = now()
   WHERE id = p_folder_id AND version = p_expected_version;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN public.note_folder_reject(v_folder.org_id, p_folder_id, 'restore', 'VERSION_CONFLICT', 'Folder changed in another session. Reload and try again.', to_jsonb(v_folder));
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'folder', public.note_folder_visible_payload(p_folder_id),
    'version', p_expected_version + 1
  );
  PERFORM public.note_folder_write_audit(v_folder.org_id, p_folder_id, 'restore', true, NULL, to_jsonb(v_folder), v_result->'folder');
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public.note_folder_receipt_put(p_idempotency_key, v_folder.org_id, 'restore', v_result);
  END IF;
  RETURN v_result;
END;
$$;

INSERT INTO public.note_folders (org_id, name, link_mode, is_system)
SELECT o.id, 'General Notes', 'independent', true
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.note_folders f
  WHERE f.org_id = o.id AND f.is_system = true AND f.archived_at IS NULL
);

UPDATE public.production_notes pn
SET folder_id = f.id
FROM public.projects p
JOIN public.note_folders f
  ON f.org_id = p.org_id AND f.is_system = true AND f.archived_at IS NULL
WHERE pn.project_id = p.id
  AND pn.folder_id IS NULL;

INSERT INTO public.note_folder_migrations (org_id, general_notes_id, notes_before, notes_after)
SELECT
  f.org_id,
  f.id,
  (SELECT count(*) FROM public.production_notes pn
     JOIN public.projects p ON p.id = pn.project_id
    WHERE p.org_id = f.org_id),
  (SELECT count(*) FROM public.production_notes pn
     JOIN public.projects p ON p.id = pn.project_id
    WHERE p.org_id = f.org_id AND pn.folder_id = f.id)
FROM public.note_folders f
WHERE f.is_system = true
ON CONFLICT (org_id) DO NOTHING;

ALTER TABLE public.note_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_folder_job_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_folder_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_folder_mutation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note_folder_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS note_folders_select ON public.note_folders;
CREATE POLICY note_folders_select ON public.note_folders
  FOR SELECT TO authenticated
  USING (public.user_can_access_note_folder(id));

DROP POLICY IF EXISTS note_folders_insert ON public.note_folders;
CREATE POLICY note_folders_insert ON public.note_folders
  FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS note_folders_update ON public.note_folders;
CREATE POLICY note_folders_update ON public.note_folders
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS note_folders_delete ON public.note_folders;
CREATE POLICY note_folders_delete ON public.note_folders
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS note_folder_job_links_select ON public.note_folder_job_links;
CREATE POLICY note_folder_job_links_select ON public.note_folder_job_links
  FOR SELECT TO authenticated
  USING (public.user_can_access_note_folder(folder_id));

DROP POLICY IF EXISTS note_folder_job_links_write ON public.note_folder_job_links;
CREATE POLICY note_folder_job_links_write ON public.note_folder_job_links
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS note_folder_audit_select ON public.note_folder_audit_events;
CREATE POLICY note_folder_audit_select ON public.note_folder_audit_events
  FOR SELECT TO authenticated
  USING (public.user_is_org_admin(org_id));

DROP POLICY IF EXISTS note_folder_receipts_select ON public.note_folder_mutation_receipts;
CREATE POLICY note_folder_receipts_select ON public.note_folder_mutation_receipts
  FOR SELECT TO authenticated
  USING (false);

DROP POLICY IF EXISTS note_folder_migrations_select ON public.note_folder_migrations;
CREATE POLICY note_folder_migrations_select ON public.note_folder_migrations
  FOR SELECT TO authenticated
  USING (public.user_is_org_admin(org_id));

DROP POLICY IF EXISTS production_notes_folder_select ON public.production_notes;
CREATE POLICY production_notes_folder_select ON public.production_notes
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (folder_id IS NULL OR public.user_can_access_note_folder(folder_id));

DROP POLICY IF EXISTS production_notes_folder_insert ON public.production_notes;
CREATE POLICY production_notes_folder_insert ON public.production_notes
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (folder_id IS NULL OR public.user_can_access_note_folder(folder_id));

DROP POLICY IF EXISTS production_notes_folder_update ON public.production_notes;
CREATE POLICY production_notes_folder_update ON public.production_notes
  AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (folder_id IS NULL OR public.user_can_access_note_folder(folder_id))
  WITH CHECK (folder_id IS NULL OR public.user_can_access_note_folder(folder_id));

DROP POLICY IF EXISTS production_notes_folder_delete ON public.production_notes;
CREATE POLICY production_notes_folder_delete ON public.production_notes
  AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (folder_id IS NULL OR public.user_can_access_note_folder(folder_id));

REVOKE ALL ON TABLE public.note_folders FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.note_folder_job_links FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.note_folder_audit_events FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.note_folder_mutation_receipts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.note_folder_migrations FROM PUBLIC, anon;

GRANT SELECT ON TABLE public.note_folders TO authenticated;
GRANT SELECT ON TABLE public.note_folder_job_links TO authenticated;
GRANT SELECT ON TABLE public.note_folder_audit_events TO authenticated;
GRANT SELECT ON TABLE public.note_folder_migrations TO authenticated;
GRANT ALL ON TABLE public.note_folders TO service_role;
GRANT ALL ON TABLE public.note_folder_job_links TO service_role;
GRANT ALL ON TABLE public.note_folder_audit_events TO service_role;
GRANT ALL ON TABLE public.note_folder_mutation_receipts TO service_role;
GRANT ALL ON TABLE public.note_folder_migrations TO service_role;

REVOKE ALL ON FUNCTION public.user_is_org_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_effective_project_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_access_note_folder(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_manage_note_folder_links(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_can_edit_note_folder(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_visible_payload(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_write_audit(uuid, uuid, text, boolean, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_reject(uuid, uuid, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_receipt_get(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_receipt_put(text, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.note_folder_same_org_projects(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ensure_general_notes_folder(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_visible_note_folders(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_note_folder(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rename_note_folder(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_note_folder(uuid, uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_note_folder_links(uuid, uuid[], integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_note_folder(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_note_folder(uuid, integer, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.user_is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.note_folder_effective_project_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_note_folder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_manage_note_folder_links(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_edit_note_folder(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_visible_note_folders(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_note_folder(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_note_folder(uuid, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_note_folder(uuid, uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_note_folder_links(uuid, uuid[], integer, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_note_folder(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_note_folder(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_general_notes_folder(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
