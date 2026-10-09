import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { initialize, migrationUrl } from './fixture.ts';
import { runCases } from './cases.ts';
const db = new PGlite();
try {
  await initialize(db);
  await db.exec(await readFile(migrationUrl,'utf8'));
  console.log(`${await runCases(db)} revision evidence checks passed`);
} catch(error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode=1;
} finally { await db.close(); }
