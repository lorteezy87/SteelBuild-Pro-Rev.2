// Shared helpers for the type-safety CI ratchets (strictNullChecks +
// noImplicitAny). Each gate runs a full `tsc -p <config>` compile and FILTERS
// the diagnostics by file: errors in a grandfathered ignore-list are tolerated,
// any other error of that flag fails the gate. This module owns the parse +
// filter + report + run logic; the per-gate scripts (strict-typecheck.mjs,
// noimplicitany-typecheck.mjs) are thin wrappers that supply a tsconfig + an
// ignore-list. Design: docs/superpowers/specs/2026-06-22-strictnullchecks-ratchet-design.md

import { spawnSync } from 'node:child_process'
import path from 'node:path'

// Normalize a tsc-reported file path to repo-relative POSIX form so ignore-list
// matching is identical on Windows (local) and Linux (CI).
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
export function partitionDiagnostics(diags, ignore = [], cwd = process.cwd()) {
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
export function staleIgnores(diags, ignore = [], cwd = process.cwd()) {
  const withErrors = new Set(diags.map((d) => normalizePath(d.file, cwd)))
  return ignore.map((f) => normalizePath(f, cwd)).filter((f) => !withErrors.has(f))
}

export function countByFile(diags) {
  const counts = new Map()
  for (const d of diags) counts.set(d.file, (counts.get(d.file) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

// Run one gate: spawn `tsc -p <configPath>`, filter the diagnostics by `ignore`,
// print a report, and return the process exit code (0 pass, 1 enforced errors
// remain, 2 tsc failed to run). `gateName` labels output; `ignoreVarName` names
// the ignore-list constant in the wrapper, for the failure hint.
export function runTscGate({ repoRoot, configPath, ignore, gateName, ignoreVarName }) {
  const tscBin = path.resolve(repoRoot, 'node_modules/typescript/bin/tsc')
  const res = spawnSync(
    process.execPath,
    [tscBin, '-p', path.join(repoRoot, configPath)],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  if (res.error) {
    console.error(`${gateName}: failed to run tsc:`, res.error.message)
    return 2
  }
  const output = (res.stdout || '') + (res.stderr || '')
  const diags = parseTscOutput(output)
  const { surviving, ignored } = partitionDiagnostics(diags, ignore, repoRoot)

  const stale = staleIgnores(diags, ignore, repoRoot)
  if (stale.length) {
    console.log(`\n${gateName}: these grandfathered files are now CLEAN — remove them from ${ignoreVarName}:`)
    for (const f of stale) console.log('  - ' + f)
  }

  console.log(
    `\n${gateName} gate: ${ignored.length} error(s) across ${ignore.length} grandfathered file(s) [ignored], ${surviving.length} error(s) enforced.`,
  )

  if (surviving.length) {
    console.error(`\n✖ ${gateName} errors in NON-grandfathered files:\n`)
    for (const d of surviving) console.error('  ' + d.raw)
    console.error('\nBy file:')
    for (const [file, n] of countByFile(surviving)) console.error(`  ${n}\t${file}`)
    console.error(
      `\n${surviving.length} ${gateName} error(s) must be fixed. If a file is genuinely unfixable without a behavior change, add it to ${ignoreVarName} with justification.`,
    )
    return 1
  }

  console.log(`✓ ${gateName} gate passed.`)
  return 0
}
