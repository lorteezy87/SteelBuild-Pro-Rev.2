import { PGlite } from '@electric-sql/pglite';
import { initialize, enableFixtureMutations } from './fixture.ts';
import { runCases } from './cases.ts';
import { runCommandCases } from './commandCases.ts';
import { runSourceCases } from './sourceCases.ts';
import { runBoundaryCases } from './boundaryCases.ts';
import { runExportCases } from './exportCases.ts';
import { runPackageCases, runInstallationCases } from './packageCases.ts';
const db=new PGlite();
try{
  await initialize(db);
  console.log(`${await runInstallationCases(db)} installation checks passed`);
  console.log(`${await runPackageCases(db)} package checks passed`);
  await enableFixtureMutations(db);
  console.log(`${await runExportCases(db)} observation export checks passed`);
  console.log(`${await runBoundaryCases(db)} write boundary checks passed`);
  console.log(`${await runSourceCases(db)} source protection checks passed`);
  console.log(`${await runCommandCases(db)} atomic command checks passed`);
  console.log(`${await runCases(db)} behavioral checks passed`);
}catch(error){console.error(error instanceof Error?`${error.name}: ${error.message}`:error);process.exitCode=1;}
finally{await db.close();}
