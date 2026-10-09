import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { initialize, candidateUrl } from './fixture.ts';
import { runCases } from './cases.ts';
const db=new PGlite();
try{
  await initialize(db);
  try{await db.exec(await readFile(candidateUrl,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  console.log(`${await runCases(db)} behavioral checks passed`);
}catch(error){console.error(error instanceof Error?`${error.name}: ${error.message}`:error);process.exitCode=1;}
finally{await db.close();}
