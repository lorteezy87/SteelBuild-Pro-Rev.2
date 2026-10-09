import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { cases } from './cases.ts';

const db = new PGlite();
try {
  await db.exec(await readFile(new URL('./fixture.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('./live-functions.sql', import.meta.url), 'utf8'));
  if (process.env.PROJECT_LIMIT_REPRO !== '1') {
    await db.exec(await readFile(new URL('../../migrations/20261009140000_enforce_project_plan_limits.sql', import.meta.url), 'utf8'));
  }
  await cases((sql, values) => db.query(sql,values));
} finally { await db.close(); }
