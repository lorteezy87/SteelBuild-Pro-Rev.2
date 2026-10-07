import { readFile } from 'node:fs/promises';
import { ids } from '../commercial-create/fixture.mjs';

// Shared setup accepts PGlite or a real PostgreSQL query/exec adapter. The
// captured production function definitions run only in the isolated fixture.
export const lifecycleFunctions = JSON.parse(await readFile(new URL('./live-functions.json', import.meta.url), 'utf8'));

export async function installLifecycleFixture(db) {
  await db.exec(`alter table public.projects add column approved_change_total numeric default 0;
    create table auth.mfa_factors(user_id uuid references auth.users(id),status text);
    insert into auth.mfa_factors values ('${ids.pm}','verified');
    grant usage on schema steelbuild_security to authenticated;
    create function public.lifecycle_fixture_stamp() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp(); return new; end$$;
    create trigger stamp before update on public.change_orders for each row execute function public.lifecycle_fixture_stamp();`);
  for (const fn of lifecycleFunctions) await db.exec(`${fn.definition};`);
  await db.exec('revoke all on function steelbuild_security.satisfies_mfa() from public; grant execute on function steelbuild_security.satisfies_mfa() to authenticated;');
  await db.exec(await readFile(new URL('../../migrations/20261007113400_reviewed_change_order_saves.sql', import.meta.url), 'utf8'));
}
