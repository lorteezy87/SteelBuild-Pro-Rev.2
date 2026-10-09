import { readFile } from 'node:fs/promises';

export const ids = {
  pm: '10000000-0000-4000-8000-000000000001',
  colleague: '10000000-0000-4000-8000-000000000002',
  field: '10000000-0000-4000-8000-000000000003',
  viewer: '10000000-0000-4000-8000-000000000004',
  outsider: '10000000-0000-4000-8000-000000000005',
  project: '20000000-0000-4000-8000-000000000001',
  otherProject: '20000000-0000-4000-8000-000000000002',
  org: '30000000-0000-4000-8000-000000000001',
  otherOrg: '30000000-0000-4000-8000-000000000002',
};

export async function createCommercialFixture(PGliteClass) {
  const Database = PGliteClass ?? (await import('@electric-sql/pglite')).PGlite;
  const db = new Database();
  return initializeCommercialFixture(db);
}

// The same captured schema/guards run in embedded checks and isolated PostgreSQL CI.
// Callers supply a dedicated database connection, never a pool whose role can drift.
export async function initializeCommercialFixture(db) {
  const fixture = JSON.parse(await readFile(new URL('./live-fixture.json', import.meta.url),'utf8'));
  const support = JSON.parse(await readFile(new URL('./support-functions.json', import.meta.url),'utf8'));
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
    create function auth.role() returns text language sql stable as $$select auth.jwt()->>'role'$$;
    create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on all functions in schema auth to authenticated,anon;
    create schema steelbuild_security;
    create function steelbuild_security.satisfies_mfa() returns boolean language sql stable as $$select coalesce(auth.jwt()->>'aal','aal2')='aal2'$$;
    create table public.organizations(id uuid primary key,member_default_project_role text default 'viewer');
    create table public.organization_members(org_id uuid references organizations(id),user_id uuid references auth.users(id) on delete cascade,role text);
    create table public.projects(id uuid primary key,org_id uuid references organizations(id),name text,is_deleted boolean default false,retainage_percent numeric default 10);
    create table public.user_projects(project_id uuid references projects(id),user_id uuid references auth.users(id) on delete cascade,role text);
    create table public.number_sequences(project_id uuid references projects(id),record_type text,next_value integer,updated_at timestamptz,primary key(project_id,record_type));
  `);
  const tables = [...new Set(fixture.columns.map(c=>c.table_name))];
  for (const table of tables) {
    const columns = fixture.columns.filter(c=>c.table_name===table).map(c => {
      const type = c.udt_name.startsWith('_') ? `${c.udt_name.slice(1)}[]` : c.udt_name;
      return `"${c.column_name}" ${type}${c.column_default ? ` default ${c.column_default}` : ''}${c.is_nullable==='NO' ? ' not null' : ''}${c.column_name==='id' ? ' primary key' : ''}`;
    });
    await db.exec(`create table public."${table}"(${columns.join(',')});`);
  }
  for (const fn of [...fixture.functions,...support]) await db.exec(`${fn.definition};`);
  for (const [table,guard] of [
    ['backcharges','enforce_backcharge_guards'],['backcharge_events','enforce_backcharge_event_guards'],
    ['change_orders','enforce_change_order_guards'],['change_requests','enforce_change_request_guards'],
    ['deliveries','enforce_delivery_guards'],['delivery_items','enforce_delivery_item_guards'],['sov_items','enforce_cost_row_guards'],
  ]) await db.exec(`create trigger guard before insert or update or delete on public.${table} for each row execute function public.${guard}();`);
  for (const table of tables.filter(t=>t!=='delivery_items')) {
    await db.exec(`alter table public.${table} enable row level security;
      create policy project_members on public.${table} for all to authenticated using (public.user_has_project_access(project_id)) with check (public.user_has_project_access(project_id));`);
  }
  await db.exec(`alter table delivery_items enable row level security;
    create policy delivery_members on delivery_items for all to authenticated using (exists(select 1 from deliveries d where d.id=delivery_id and public.user_has_project_access(d.project_id))) with check (exists(select 1 from deliveries d where d.id=delivery_id and public.user_has_project_access(d.project_id)));
    grant select,insert,update,delete on all tables in schema public to authenticated;
    insert into auth.users values ${['pm','colleague','field','viewer','outsider'].map(k=>`('${ids[k]}')`).join(',')};
    insert into organizations values ('${ids.org}','viewer'),('${ids.otherOrg}','viewer');
    insert into projects(id,org_id,name) values ('${ids.project}','${ids.org}','Steel A'),('${ids.otherProject}','${ids.otherOrg}','Steel B');
    insert into organization_members values ${['pm','colleague','field','viewer'].map(k=>`('${ids.org}','${ids[k]}','member')`).join(',')},('${ids.otherOrg}','${ids.outsider}','member');
    insert into user_projects values ('${ids.project}','${ids.pm}','pm'),('${ids.project}','${ids.colleague}','pm'),('${ids.project}','${ids.field}','field'),('${ids.project}','${ids.viewer}','viewer'),('${ids.otherProject}','${ids.outsider}','pm');
  `);
  const admin = () => db.exec('reset role');
  const asUser = async (user=ids.pm,aal='aal2') => {
    await admin();
    await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,role:'authenticated',email:'fixture@example.invalid',aal})]);
    await db.exec('set role authenticated');
  };
  return { db, asUser, admin, ids };
}
