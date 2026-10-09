-- Disposable test-only schema. Hosted acceptance uses the installed schema.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
GRANT USAGE ON SCHEMA auth, public TO authenticated, anon, service_role;
CREATE TABLE public.organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan text NOT NULL DEFAULT 'free', member_default_project_role text DEFAULT 'viewer');
CREATE TABLE public.organization_members(org_id uuid REFERENCES public.organizations, user_id uuid, role text, created_at timestamptz DEFAULT now(), PRIMARY KEY(org_id,user_id));
CREATE TABLE public.projects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL, project_number text, client text, general_contractor text, engineer_of_record text,
 project_manager text, superintendent text, contract_type text, original_contract_value numeric,
 start_date date, target_completion_date date, forecast_completion_date date, phase text, health_status text,
 retainage_percent numeric, contingency_amount numeric, address text, notes text, metadata jsonb DEFAULT '{}',
 job_type text, joist_manufacturer text, deck_manufacturer text, is_deleted boolean DEFAULT false, deleted_at timestamptz
);
CREATE TABLE public.user_projects(user_id uuid, project_id uuid REFERENCES public.projects, role text, PRIMARY KEY(user_id,project_id));
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.projects TO authenticated, service_role;
GRANT SELECT ON public.organizations, public.organization_members, public.user_projects TO authenticated;
