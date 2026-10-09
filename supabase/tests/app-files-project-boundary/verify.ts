import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { candidate, initialize, protectedSnapshot, reset } from './fixture.ts';
import { cases } from './cases.ts';
const db=new PGlite();
try {
  await initialize(db);
  await reset(db);
  const before=await protectedSnapshot(db);
  if(process.env.APP_FILE_RESERVATION_REPRO!=='1') await db.exec(await readFile(candidate,'utf8'));
  assert.deepEqual(await protectedSnapshot(db),before,'Additive candidate must preserve existing objects, projects and Storage policies');
  await cases(db);
} finally { await db.close(); }
