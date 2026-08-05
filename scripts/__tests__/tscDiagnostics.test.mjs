import { describe, it, expect } from 'vitest'
import {
  parseTscOutput,
  partitionDiagnostics,
  normalizePath,
  staleIgnores,
  countByFile,
} from '../lib/tscDiagnostics.mjs'

// Shared filter used by BOTH the strictNullChecks and noImplicitAny gates, so
// the fixtures mix TS18048 (strict-null) and TS7006 (noImplicitAny) codes.
const SAMPLE = [
  "src/pages/GanttChart.tsx(10,5): error TS2532: Object is possibly 'undefined'.",
  "src/pages/Schedule.tsx(22,9): error TS18048: 'x' is possibly 'undefined'.",
  "src/pages/Deliveries.tsx(224,62): error TS7006: Parameter 'id' implicitly has an 'any' type.",
  'Found 3 errors in 3 files.',
  "src/pages/ResourceScheduling.tsx(3,1): error TS2322: Type 'null' is not assignable to type 'string'.",
  '',
].join('\n')

describe('tscDiagnostics shared filter', () => {
  it('parses only error-diagnostic lines (skips summaries/blanks)', () => {
    const diags = parseTscOutput(SAMPLE)
    expect(diags).toHaveLength(4)
    expect(diags[0]).toMatchObject({
      file: 'src/pages/GanttChart.tsx',
      line: 10,
      col: 5,
      code: 'TS2532',
    })
    expect(diags[2].code).toBe('TS7006')
  })

  it('partitions grandfathered (ignored) vs enforced (surviving)', () => {
    const diags = parseTscOutput(SAMPLE)
    const ignore = ['src/pages/GanttChart.tsx', 'src/pages/ResourceScheduling.tsx']
    const { surviving, ignored } = partitionDiagnostics(diags, ignore)
    expect(ignored).toHaveLength(2)
    expect(surviving.map((d) => d.file).sort()).toEqual([
      'src/pages/Deliveries.tsx',
      'src/pages/Schedule.tsx',
    ])
  })

  it('normalizes windows backslashes and absolute paths to repo-relative POSIX', () => {
    expect(normalizePath('src\\pages\\GanttChart.tsx')).toBe('src/pages/GanttChart.tsx')
    expect(normalizePath('C:\\repo\\src\\pages\\GanttChart.tsx', 'C:\\repo')).toBe(
      'src/pages/GanttChart.tsx',
    )
    expect(normalizePath('/repo/src/pages/GanttChart.tsx', '/repo')).toBe(
      'src/pages/GanttChart.tsx',
    )
    expect(normalizePath('./src/pages/GanttChart.tsx')).toBe('src/pages/GanttChart.tsx')
  })

  it('flags grandfathered files that are now clean (stale ignores)', () => {
    const diags = parseTscOutput('src/pages/GanttChart.tsx(1,1): error TS7006: x')
    const stale = staleIgnores(diags, [
      'src/pages/GanttChart.tsx',
      'src/pages/ResourceScheduling.tsx',
    ])
    expect(stale).toEqual(['src/pages/ResourceScheduling.tsx'])
  })

  it('counts errors by file, highest first', () => {
    const diags = parseTscOutput(SAMPLE)
    expect(countByFile(diags)[0][1]).toBe(1)
    expect(countByFile(diags)).toHaveLength(4)
  })

  it('treats an all-clean run as zero surviving and all ignores stale', () => {
    const { surviving, ignored } = partitionDiagnostics([], ['src/pages/GanttChart.tsx'])
    expect(surviving).toHaveLength(0)
    expect(ignored).toHaveLength(0)
    expect(staleIgnores([], ['src/pages/GanttChart.tsx'])).toEqual(['src/pages/GanttChart.tsx'])
  })
})
