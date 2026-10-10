import { readFile } from 'node:fs/promises';
export interface Database {
  exec(sql: string): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export const ids = {
  org: 'fa090000-0000-4000-8000-000000000001', otherOrg: 'fa090000-0000-4000-8000-000000000002',
  project: 'fa090000-0000-4000-8000-000000000003', otherProject: 'fa090000-0000-4000-8000-000000000004',
  pm: 'fa090000-0000-4000-8000-000000000005', field: 'fa090000-0000-4000-8000-000000000006',
  viewer: 'fa090000-0000-4000-8000-000000000007', outsider: 'fa090000-0000-4000-8000-000000000008',
  request: 'fa090000-0000-4000-8000-000000000009', request2: 'fa090000-0000-4000-8000-000000000010',
};
export const candidate = new URL('../../candidates/app-file-upload-reservations.sql', import.meta.url);
export async function initialize(db: Database) {
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
    END $$;
    ALTER ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage; CREATE SCHEMA steelbuild_security;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
  `);
  await db.exec(`
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE TABLE auth.mfa_factors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users ON DELETE CASCADE,status text);
    CREATE TABLE public.organizations(id uuid PRIMARY KEY, member_default_project_role text,plan text DEFAULT 'business');
    CREATE TABLE public.organization_members(org_id uuid REFERENCES organizations ON DELETE CASCADE,user_id uuid REFERENCES auth.users ON DELETE CASCADE,role text,PRIMARY KEY(org_id,user_id));
    CREATE TABLE public.projects(id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES organizations ON DELETE CASCADE,is_deleted boolean DEFAULT false);
    CREATE TABLE public.user_projects(project_id uuid REFERENCES projects ON DELETE CASCADE,user_id uuid REFERENCES auth.users ON DELETE CASCADE,role text,PRIMARY KEY(project_id,user_id));
    CREATE TABLE public.documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid REFERENCES projects,file_url text);
    CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,owner uuid,metadata jsonb DEFAULT '{}',UNIQUE(bucket_id,name));
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY existing_object_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='app-files');
    GRANT USAGE ON SCHEMA auth,public,storage,steelbuild_security TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,service_role;
    -- Match source Supabase public default grants, plus a deliberately broader
    -- global default to prove the candidate revokes inherited private grants.
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
    CREATE FUNCTION public.user_is_org_member(p_org_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE org_id=p_org_id AND user_id=(SELECT auth.uid())) $$;
    CREATE FUNCTION public.user_has_project_access(p_project_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
      SELECT EXISTS(SELECT 1 FROM public.projects p JOIN public.organizations o ON o.id=p.org_id
        JOIN public.organization_members m ON m.org_id=p.org_id AND m.user_id=(SELECT auth.uid())
        WHERE p.id=p_project_id AND NOT coalesce(p.is_deleted,false) AND
        (m.role IN ('owner','admin') OR o.member_default_project_role IS NOT NULL OR
         EXISTS(SELECT 1 FROM public.user_projects up WHERE up.project_id=p.id AND up.user_id=(SELECT auth.uid())))) $$;
  `);
  await db.exec(await readFile(new URL('../../migrations/20261008032524_require_current_workspace_membership_for_project_roles.sql',import.meta.url),'utf8'));
  const mfa = await readFile(new URL('../../migrations/20261007073051_enforce_enrolled_mfa_at_server_boundaries.sql',import.meta.url),'utf8');
  const start = mfa.indexOf('CREATE OR REPLACE FUNCTION steelbuild_security.satisfies_mfa()');
  await db.exec(mfa.slice(start,mfa.indexOf('$function$;',start)+12));
  const plans=await readFile(new URL('../project-plan-limits/live-functions.sql',import.meta.url),'utf8');
  for(const name of ['plan_limits','plan_member_limit']) {
    const at=plans.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    await db.exec(plans.slice(at,plans.indexOf('$function$;',at)+12));
  }
  const membership=await readFile(new URL('../../migrations/20260921080604_harden_workspace_membership_and_audit_boundaries.sql',import.meta.url),'utf8');
  const guard=membership.indexOf('CREATE OR REPLACE FUNCTION public.enforce_org_member_guard()');
  await db.exec(membership.slice(guard,membership.indexOf('$function$;',guard)+12));
  await db.exec('CREATE TRIGGER membership_guard BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.enforce_org_member_guard()');
}
export async function reset(db: Database) {
  await db.exec(`RESET ROLE; TRUNCATE public.organizations,auth.users CASCADE; TRUNCATE storage.objects;
    INSERT INTO auth.users VALUES('${ids.pm}'),('${ids.field}'),('${ids.viewer}'),('${ids.outsider}');
    INSERT INTO organizations(id,member_default_project_role) VALUES('${ids.org}',NULL),('${ids.otherOrg}',NULL);
    INSERT INTO projects VALUES('${ids.project}','${ids.org}',false),('${ids.otherProject}','${ids.otherOrg}',false);
    INSERT INTO organization_members VALUES('${ids.org}','${ids.pm}','member'),('${ids.org}','${ids.field}','member'),('${ids.org}','${ids.viewer}','member');
    INSERT INTO user_projects VALUES('${ids.project}','${ids.pm}','pm'),('${ids.project}','${ids.field}','field'),('${ids.project}','${ids.viewer}','viewer');
    INSERT INTO storage.objects(bucket_id,name,owner) VALUES('app-files','${ids.org}/uploads/existing.pdf','${ids.pm}');
  `);
}
export async function actor(db: Database, user = ids.pm, role = 'authenticated', aal = 'aal2') {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role,aal})]);
  if(!['authenticated','anon','service_role'].includes(role)) throw new Error('Invalid fixture role');
  await db.exec(`SET ROLE ${role}`);
}
export const projectScope = {kind:'project',orgId:ids.org,projectId:ids.project};
export const reserveSql = 'SELECT public.reserve_app_file_upload($1::uuid,$2::jsonb,$3::text,$4::text) result';
export const args = (request = ids.request, scope: unknown = projectScope, workflow = 'drawings', extension = 'pdf') => [request,JSON.stringify(scope),workflow,extension];
export async function reserve(db: Database, parameters = args()) { return (await db.query(reserveSql,parameters)).rows[0].result as {request_id:string;bucket:string;path:string}; }
export async function protectedSnapshot(db:Database) {
  return {
    policies:(await db.query("SELECT * FROM pg_policies WHERE schemaname='storage' ORDER BY policyname")).rows,
    objects:(await db.query('SELECT * FROM storage.objects ORDER BY id')).rows,
    projects:(await db.query('SELECT * FROM projects ORDER BY id')).rows,
  };
}
