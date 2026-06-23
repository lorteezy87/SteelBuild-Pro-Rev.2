// strictNullChecks ratchet gate (#8 phase 2).
// Design: docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md
//
// Why this exists: the base tsconfig has strictNullChecks OFF. We want NEW code
// and every already-clean .ts/.tsx file to be strict-null enforced in CI, while
// grandfathering a small, shrinking set of legacy offenders. A plain `tsc
// --strictNullChecks` can't do that — `exclude` only drops ROOT files, and the
// offenders get pulled back into the program via imports, so their errors
// resurface. This script runs the full strict-null compile (so types resolve
// correctly) and then FILTERS the diagnostics by file: errors in grandfathered
// files are ignored; any error in any other file fails the gate.
//
// To tighten the ratchet: clean a file, then delete it from STRICT_NULL_IGNORE.
// Never add to the list without a deliberate, reviewed reason.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Grandfathered files: strict-null errors here are ignored by the gate. Paths
// are repo-relative POSIX (forward slashes); matching is OS-agnostic. SHRINK
// THIS LIST — it should only ever get shorter.
export const STRICT_NULL_IGNORE = [
  'src/pages/ResourceScheduling.tsx',
  'src/pages/GanttChart.tsx',
]

// Normalize a tsc-reported file path to repo-relative POSIX form so the
// ignore-list matches identically on Windows (local) and Linux (CI).
export function normalizePath(file, cwd = process.cwd()) {
  let p = String(file).trim().replace(/\\/g, '/')
  const root = String(cwd).replace(/\\/g, '/')
  if (p.startsWith(root + '/')) p = p.slice(root.length + 1)
  return p.replace(/^\.\//, '')
}

// Parse `tsc` (pretty:false) output lines of the form:
//   src/foo.tsx(12,5): error TS2532: Object is possibly 'undefined'.
// Non-diagnostic lines (e.g. "Found 2 errors in 2 files.") are skipped.
const DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/
export function parseTscOutput(stdout) {
  const diags = []
  for (const raw of String(stdout).split(/\r?\n/)) {
    const m = DIAG_RE.exec(raw)
    if (!m) continue
    diags.push({
      file: m[1],
      line: Number(m[2]),
      col: Number(m[3]),
      code: m[4],
      message: m[5],
      raw,
    })
  }
  return diags
}

// Split diagnostics into { surviving, ignored } by the ignore-list.
export function partitionDiagnostics(diags, ignore = STRICT_NULL_IGNORE, cwd = process.cwd()) {
  const ignoreSet = new Set(ignore.map((f) => normalizePath(f, cwd)))
  const surviving = []
  const ignored = []
  for (const d of diags) {
    if (ignoreSet.has(normalizePath(d.file, cwd))) ignored.push(d)
    else surviving.push(d)
  }
  return { surviving, ignored }
}

// Grandfathered files that produced ZERO errors this run -> safe to remove from
// the ignore-list (ratchet tightening). Returned as normalized repo paths.
export function staleIgnores(diags, ignore = STRICT_NULL_IGNORE, cwd = process.cwd()) {
  const withErrors = new Set(diags.map((d) => normalizePath(d.file, cwd)))
  return ignore.map((f) => normalizePath(f, cwd)).filter((f) => !withErrors.has(f))
}

function countByFile(diags) {
  const counts = new Map()
  for (const d of diags) counts.set(d.file, (counts.get(d.file) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const tscBin = path.resolve(repoRoot, 'node_modules/typescript/bin/tsc')
  const res = spawnSync(
    process.execPath,
    [tscBin, '-p', path.join(repoRoot, 'tsconfig.strict.json')],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (res.error) {
    console.error('strict-typecheck: failed to run tsc:', res.error.message)
    process.exit(2)
  }
  const output = (res.stdout || '') + (res.stderr || '')
  const diags = parseTscOutput(output)
  const { surviving, ignored } = partitionDiagnostics(diags, STRICT_NULL_IGNORE, repoRoot)

  const stale = staleIgnores(diags, STRICT_NULL_IGNORE, repoRoot)
  if (stale.length) {
    console.log('\nstrictNullChecks: these grandfathered files are now CLEAN — remove them from STRICT_NULL_IGNORE:')
    for (const f of stale) console.log('  - ' + f)
  }

  console.log(
    `\nstrictNullChecks gate: ${ignored.length} error(s) across ${STRICT_NULL_IGNORE.length} grandfathered file(s) [ignored], ${surviving.length} error(s) enforced.`,
  )

  if (surviving.length) {
    console.error('\n✖ strictNullChecks errors in NON-grandfathered files:\n')
    for (const d of surviving) console.error('  ' + d.raw)
    console.error('\nBy file:')
    for (const [file, n] of countByFile(surviving)) console.error(`  ${n}\t${file}`)
    console.error(
      `\n${surviving.length} strict-null error(s) must be fixed. If a file is genuinely unfixable without a behavior change, add it to STRICT_NULL_IGNORE in scripts/strict-typecheck.mjs with justification.`,
    )
    process.exit(1)
  }

  console.log('✓ strictNullChecks gate passed.')
  process.exit(0)
}

// Run the gate only when executed directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
