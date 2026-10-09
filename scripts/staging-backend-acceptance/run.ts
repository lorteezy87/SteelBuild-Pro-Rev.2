import { mkdir, writeFile } from 'node:fs/promises';
import { runAcceptance } from './acceptance.ts';

// This executable is never imported by CI unit tests. No command-line overrides,
// dumps, arbitrary output paths, credential persistence, or provider operations.
try {
  const report = await runAcceptance(process.env);
  await mkdir('test-results/backend-acceptance', { recursive: true });
  await writeFile('test-results/backend-acceptance/summary.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(`Bounded backend acceptance: ${report.status}; stage=${report.stage}; cases=${report.cases.length}`);
  // Incomplete coverage must never satisfy a production acceptance success gate.
  process.exitCode = report.status === 'FAIL' ? 1 : 2;
} catch {
  console.error('Bounded backend acceptance failed to retain sanitized evidence');
  process.exitCode = 1;
}
