-- Fix 0: Create user_projects table if it does not exist.
-- This table was assumed to exist in the original schema but was never created.
-- It is the many-to-many join between auth users and projects, with a role.
CREATE TABLE IF NOT EXISTS public.user_projects (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id    UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  UNIQUE (user_id, project_id)
);
ALTER TABLE public.user_projects ENABLE ROW LEVEL SECURITY;

-- Temporary permissive policy so the rest of this migration can create
-- more-specific policies without hitting RLS denials during the transaction.
DROP POLICY IF EXISTS "temp_auth_all" ON public.user_projects;
CREATE POLICY "temp_auth_all" ON public.user_projects
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Fix 1: Break infinite recursion in user_projects RLS policy.
-- admins_manage_memberships was self-referential (queried user_projects from
-- within a policy on user_projects). Replace with a SECURITY DEFINER function
-- that reads user_projects bypassing RLS.
CREATE OR REPLACE FUNCTION public.get_my_project_role(p_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_projects
  WHERE user_id = auth.uid()
    AND project_id = p_project_id
  LIMIT 1;
$$;

DROP POLICY IF EXISTS admins_manage_memberships ON user_projects;

CREATE POLICY admins_manage_memberships ON user_projects
  FOR ALL
  USING (
    public.get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    public.get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin'])
  );

-- Fix 2: Bootstrap deadlock — new project INSERT was blocked because
-- admins_manage_memberships WITH CHECK required an existing membership row,
-- but none exists yet when the project is first created.
-- Solution: dedicated INSERT policy for self-membership + SECURITY INVOKER trigger.
CREATE POLICY users_insert_own_membership ON user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND get_my_project_role(project_id) IS NULL
  );

CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_projects (user_id, project_id, role)
  VALUES (auth.uid(), NEW.id, 'owner');
  RETURN NEW;
END;
$$;

-- Fix 3: admins_manage_memberships FOR ALL covered INSERT, causing its
-- WITH CHECK to conflict with bootstrap inserts on new projects.
-- Replaced with explicit UPDATE + DELETE policies only.
-- INSERT is now handled solely by users_insert_own_membership.
DROP POLICY IF EXISTS admins_manage_memberships ON user_projects;
DROP POLICY IF EXISTS users_insert_own_membership ON user_projects;

CREATE POLICY admins_update_memberships ON user_projects
  FOR UPDATE
  USING (get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin']))
  WITH CHECK (get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin']));

CREATE POLICY admins_delete_memberships ON user_projects
  FOR DELETE
  USING (get_my_project_role(project_id) = ANY(ARRAY['owner', 'admin']));

CREATE POLICY users_insert_own_membership ON user_projects
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Fix 4: SECURITY INVOKER trigger couldn't reliably call auth.uid() inside
-- the trigger context. Reverted to SECURITY DEFINER and added an explicit
-- postgres-role bypass policy so the trigger INSERT is never blocked by RLS.
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_projects (user_id, project_id, role)
  VALUES (auth.uid(), NEW.id, 'owner');
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS postgres_full_access ON user_projects;
CREATE POLICY postgres_full_access ON user_projects
  FOR ALL
  TO postgres
  USING (true)
  WITH CHECK (true);

-- Clean up the temporary permissive policy now that proper policies are in place.
DROP POLICY IF EXISTS "temp_auth_all" ON user_projects;

-- Fix 5: Replace unreliable AFTER trigger with an atomic RPC function.
-- The trigger approach had auth.uid() reliability issues in SECURITY DEFINER context.
-- The RPC (create_project) runs as postgres via SECURITY DEFINER, inserts both
-- the project row and the owner membership in one call, and returns the project.
DROP TRIGGER IF EXISTS trg_auto_add_project_owner ON projects;

CREATE OR REPLACE FUNCTION public.create_project(project_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid; v_project_id uuid; v_result jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO projects (name,project_number,client,general_contractor,engineer_of_record,project_manager,superintendent,contract_type,original_contract_value,start_date,target_completion_date,forecast_completion_date,phase,health_status,retainage_percent,contingency_amount,address,notes,metadata)
  SELECT (project_data->>'name'),(project_data->>'project_number'),(project_data->>'client'),(project_data->>'general_contractor'),(project_data->>'engineer_of_record'),(project_data->>'project_manager'),(project_data->>'superintendent'),(project_data->>'contract_type'),(project_data->>'original_contract_value')::numeric,(project_data->>'start_date')::date,(project_data->>'target_completion_date')::date,(project_data->>'forecast_completion_date')::date,COALESCE(project_data->>'phase','Pre-Construction'),COALESCE(project_data->>'health_status','On Track'),COALESCE((project_data->>'retainage_percent')::numeric,10),(project_data->>'contingency_amount')::numeric,(project_data->>'address'),(project_data->>'notes'),COALESCE((project_data->'metadata')::jsonb,'{}'::jsonb)
  RETURNING id INTO v_project_id;
  INSERT INTO user_projects (user_id,project_id,role) VALUES (v_user_id,v_project_id,'owner');
  SELECT to_jsonb(p) INTO v_result FROM projects p WHERE p.id = v_project_id;
  RETURN v_result;
END;$$;
GRANT EXECUTE ON FUNCTION public.create_project(jsonb) TO authenticated;

-- Fix 6: Storage policies had project_file_insert/select/update policies that
-- tried to cast the first path segment ("uploads") to uuid, causing:
--   "invalid input syntax for type uuid: 'uploads'"
-- Replace with simple authenticated-user policies matching migration 002.
DROP POLICY IF EXISTS project_file_insert ON storage.objects;
DROP POLICY IF EXISTS project_file_select ON storage.objects;
DROP POLICY IF EXISTS project_file_update ON storage.objects;
DROP POLICY IF EXISTS auth_delete_own ON storage.objects;
DROP POLICY IF EXISTS owner_file_delete ON storage.objects;
DROP POLICY IF EXISTS auth_upload ON storage.objects;
DROP POLICY IF EXISTS auth_read ON storage.objects;
DROP POLICY IF EXISTS auth_delete ON storage.objects;
DROP POLICY IF EXISTS public_read ON storage.objects;

CREATE POLICY "auth_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'app-files');
CREATE POLICY "auth_read"   ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'app-files');
CREATE POLICY "auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'app-files');
CREATE POLICY "auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'app-files');
CREATE POLICY "public_read" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'app-files');

-- Fix 7: Create missing user_profiles row for existing users.
-- The on_auth_user_created trigger only fires for new signups; backfill
-- any auth.users rows that don't yet have a profile.
INSERT INTO public.user_profiles (id, email, full_name, role)
SELECT u.id, u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
  'user'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Fix 8: Add missing columns to documents table that DMS components expect.
-- Also add discipline/drawing_number/revision/sheet_number from Fix 6.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS discipline      TEXT DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS drawing_number  TEXT,
  ADD COLUMN IF NOT EXISTS revision        TEXT,
  ADD COLUMN IF NOT EXISTS sheet_number    TEXT,
  ADD COLUMN IF NOT EXISTS display_name    TEXT,
  ADD COLUMN IF NOT EXISTS file_type       TEXT,
  ADD COLUMN IF NOT EXISTS file_size_kb    INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS revision_number TEXT DEFAULT '0',
  ADD COLUMN IF NOT EXISTS revision_date   DATE,
  ADD COLUMN IF NOT EXISTS uploaded_date   TIMESTAMPTZ;

-- Fix 10: Add sov_id column to sov_items table.
-- The UI generates a human-readable SOV ID (e.g. SOV-001) and stores it here.
ALTER TABLE public.sov_items
  ADD COLUMN IF NOT EXISTS sov_id TEXT;

-- Fix 9: Add submittal schedule-integration fields to documents table.
-- These enable linking a document (submittal) to a work package on the Gantt,
-- tracking the review lead time, and computing a contractual due date.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS linked_wp_id     UUID REFERENCES public.work_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_lead_time INTEGER DEFAULT 14,   -- calendar days for review
  ADD COLUMN IF NOT EXISTS due_date         DATE,                 -- planned approval date = upload + lead_time
  ADD COLUMN IF NOT EXISTS is_submittal     BOOLEAN DEFAULT FALSE; -- TRUE = tracked in submittal log
