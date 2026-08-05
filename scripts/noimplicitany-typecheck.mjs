// noImplicitAny ratchet gate (#8 phase 2, sibling of the strictNullChecks gate).
// Design: docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md
//
// Runs the full noImplicitAny compile (tsconfig.noimplicitany.json) and enforces
// it on every .ts/.tsx EXCEPT the grandfathered files below. New code + every
// clean file may not introduce an untyped `any`. The parse/filter/report logic
// lives in scripts/lib/tscDiagnostics.mjs (shared with the strict-null gate).
//
// To tighten the ratchet: clean a file, then delete it from NOIMPLICITANY_IGNORE.
// Never add to the list without a deliberate, reviewed reason.

import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runTscGate } from './lib/tscDiagnostics.mjs'

// Grandfathered files: noImplicitAny errors here are ignored by the gate. These
// are the heavy schedule/gantt/procurement/submittal/work-package pages whose
// backlog is being burned down incrementally. SHRINK THIS LIST — never grow it.
export const NOIMPLICITANY_IGNORE = [
  'src/pages/procurement/components.tsx',
  'src/pages/ResourceScheduling.tsx',
  'src/pages/resourceScheduling/components.tsx',
  'src/pages/workPackages/styles.ts',
  'src/pages/Schedule.tsx',
  'src/pages/submittals/SubmittalFormModal.tsx',
  'src/pages/Submittals.tsx',
  'src/pages/FabRelease.tsx',
  'src/pages/Procurement.tsx',
  'src/pages/WorkPackages.tsx',
]

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  process.exit(
    runTscGate({
      repoRoot,
      configPath: 'tsconfig.noimplicitany.json',
      ignore: NOIMPLICITANY_IGNORE,
      gateName: 'noImplicitAny',
      ignoreVarName: 'NOIMPLICITANY_IGNORE (scripts/noimplicitany-typecheck.mjs)',
    }),
  )
}
