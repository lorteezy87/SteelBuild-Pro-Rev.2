// strictNullChecks ratchet gate (#8 phase 2).
// Design: docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md
//
// Runs the full strict-null compile (tsconfig.strict.json) and enforces it on
// every .ts/.tsx EXCEPT the grandfathered files below. New code + every clean
// file is strict-null by default. The parse/filter/report logic lives in
// scripts/lib/tscDiagnostics.mjs (shared with the noImplicitAny gate).
//
// To tighten the ratchet: clean a file, then delete it from STRICT_NULL_IGNORE.
// Never add to the list without a deliberate, reviewed reason.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runTscGate } from './lib/tscDiagnostics.mjs'

// Grandfathered files: strict-null errors here are ignored by the gate. Paths
// are repo-relative POSIX. SHRINK THIS LIST — it should only ever get shorter.
export const STRICT_NULL_IGNORE = [
  'src/pages/ResourceScheduling.tsx',
]

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  process.exit(
    runTscGate({
      repoRoot,
      configPath: 'tsconfig.strict.json',
      ignore: STRICT_NULL_IGNORE,
      gateName: 'strictNullChecks',
      ignoreVarName: 'STRICT_NULL_IGNORE (scripts/strict-typecheck.mjs)',
    }),
  )
}
