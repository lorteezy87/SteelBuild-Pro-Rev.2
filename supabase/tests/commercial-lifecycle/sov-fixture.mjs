import { readFile } from 'node:fs/promises';

// Read-only staging capture 2026-10-07: actual SOV audit, both updated_at
// triggers and CHECK constraints. Minimal audit sink contains synthetic rows.
export async function installSovFixture(db) {
  const guards=JSON.parse(await readFile(new URL('./sov-live-guards.json',import.meta.url),'utf8'));
  await db.exec('create table pma_audit_logs(project_id uuid not null,entity_type text,entity_id uuid,action text,old_values jsonb,new_values jsonb,changed_by text)');
  for (const guard of guards) {
    if (guard.kind==='constraint') await db.exec(`alter table sov_items add constraint ${guard.name} ${guard.definition}`);
    else { await db.exec(`${guard.function_definition};`); await db.exec(`${guard.definition};`); }
  }
  await db.exec(await readFile(new URL('../../migrations/20261007120658_reviewed_sov_item_saves.sql',import.meta.url),'utf8'));
}
