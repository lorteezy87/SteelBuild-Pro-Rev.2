import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { initialize, candidateUrl, sourceCandidateUrl, boundaryCandidateUrl } from './fixture.ts';
import { runCases } from './cases.ts';
import { runCommandCases } from './commandCases.ts';
import { runSourceCases } from './sourceCases.ts';
import { runBoundaryCases } from './boundaryCases.ts';
const db=new PGlite();
try{
  await initialize(db);
  await db.exec(await readFile(candidateUrl,'utf8'));
  await db.exec(await readFile(sourceCandidateUrl,'utf8'));
  await db.exec(await readFile(boundaryCandidateUrl,'utf8'));
  console.log(`${await runBoundaryCases(db)} write boundary checks passed`);
  console.log(`${await runSourceCases(db)} source protection checks passed`);
  console.log(`${await runCommandCases(db)} atomic command checks passed`);
  console.log(`${await runCases(db)} behavioral checks passed`);
}catch(error){console.error(error instanceof Error?`${error.name}: ${error.message}`:error);process.exitCode=1;}
finally{await db.close();}
