import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { initialize, enableFixtureMutations } from './fixture.ts';
import { runCases } from './cases.ts';
import { runCommandCases } from './commandCases.ts';
import { runSourceCases } from './sourceCases.ts';
import { runBoundaryCases } from './boundaryCases.ts';
import { runExportCases } from './exportCases.ts';
import { runPackageCases, runInstallationCases } from './packageCases.ts';
const db=new PGlite();
async function serviceRoleState(){
  return {
    role:(await db.query("select * from pg_roles where rolname='service_role'")).rows,
    memberships:(await db.query("select * from pg_auth_members where roleid='service_role'::regrole or member='service_role'::regrole order by roleid,member,grantor")).rows,
  };
}
try{
  for(const [name,setup] of [
    ['missing RLS bypass','create role drawing_fixture_storage_admin nologin nosuperuser noinherit nobypassrls'],
    ['unexpected login','create role drawing_fixture_storage_admin login nosuperuser noinherit bypassrls'],
    ['unexpected superuser','create role drawing_fixture_storage_admin nologin superuser noinherit bypassrls'],
    ['API membership','create role authenticated;create role drawing_fixture_storage_admin nologin nosuperuser noinherit bypassrls;grant drawing_fixture_storage_admin to authenticated'],
  ]){
    const invalid=new PGlite();
    try{
      await invalid.exec(setup);
      await assert.rejects(()=>initialize(invalid),/DRAWING_FIXTURE_STORAGE_ADMIN_UNEXPECTED/);
      console.log(`PASS fixture Storage administrator refuses ${name}`);
    }finally{await invalid.close();}
  }
  // Reproduce the required shared PostgreSQL job: roles survive across databases.
  await db.exec('create role service_role nologin nosuperuser nobypassrls');
  const initialServiceRole=await serviceRoleState();
  await initialize(db);
  console.log(`${await runInstallationCases(db)} installation checks passed`);
  console.log(`${await runPackageCases(db)} package checks passed`);
  await enableFixtureMutations(db);
  console.log(`${await runExportCases(db)} observation export checks passed`);
  console.log(`${await runBoundaryCases(db)} write boundary checks passed`);
  console.log(`${await runSourceCases(db)} source protection checks passed`);
  console.log(`${await runCommandCases(db)} atomic command checks passed`);
  console.log(`${await runCases(db)} behavioral checks passed`);
  assert.deepEqual(await serviceRoleState(),initialServiceRole,'Drawing fixtures must preserve shared service_role attributes and memberships');
  console.log('PASS existing non-bypass service_role attributes and memberships remain unchanged');
}catch(error){console.error(error instanceof Error?`${error.name}: ${error.message}`:error);process.exitCode=1;}
finally{await db.close();}
