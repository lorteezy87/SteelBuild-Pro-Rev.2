import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../audit-gate.mjs', import.meta.url));
const fixtureRoots: string[] = [];

function auditProcess(report: string, npmExit = 0) {
  // Spaces and a URL fragment character exercise URL encoding on every OS,
  // including Linux CI, rather than relying solely on a Windows-only branch.
  const root = mkdtempSync(join(tmpdir(), 'steelbuild audit # '));
  fixtureRoots.push(root);
  const bin = join(root, 'npm bin');
  mkdirSync(bin);
  const gate = join(root, 'audit-gate.mjs');
  const stub = join(bin, 'npm-fixture.cjs');
  const calls = join(root, 'npm-args.json');
  copyFileSync(script, gate);
  writeFileSync(stub, `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    fs.writeFileSync(process.env.AUDIT_TEST_CALLS, JSON.stringify(args));
    if (JSON.stringify(args) !== JSON.stringify(['audit', '--omit=dev', '--json'])) {
      throw new Error('Unexpected npm audit arguments');
    }
    process.stdout.write(process.env.AUDIT_TEST_REPORT);
    process.exitCode = Number(process.env.AUDIT_TEST_EXIT);
  `);
  writeFileSync(join(bin, 'npm.cmd'), '@echo off\r\n"%AUDIT_TEST_NODE%" "%AUDIT_TEST_NPM_JS%" %*\r\n');
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexec "$AUDIT_TEST_NODE" "$AUDIT_TEST_NPM_JS" "$@"\n', { mode: 0o755 });
  const env = { ...process.env };
  // Windows treats PATH keys case-insensitively; pass exactly one spelling.
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  Object.assign(env, {
    PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? process.env.Path ?? ''}`,
    AUDIT_TEST_NODE: process.execPath,
    AUDIT_TEST_NPM_JS: stub,
    AUDIT_TEST_CALLS: calls,
    AUDIT_TEST_REPORT: report,
    AUDIT_TEST_EXIT: String(npmExit),
    // A launcher regression must never reach the public registry from tests.
    npm_config_registry: 'http://127.0.0.1:1',
  });
  const run = (args = [gate]) => spawnSync(process.execPath, args, {
    cwd: root, env, encoding: 'utf8', timeout: 5000, windowsHide: true,
  });
  return { run, gate, calls };
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unexpected audit fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});

const reportWith = (severity: string) => JSON.stringify({
  vulnerabilities: {
    'fixture-package': {
      severity,
      via: [{ name: 'fixture-package', title: 'Fixture advisory', severity, url: 'https://github.com/advisories/GHSA-test-0000-0001' }],
    },
  },
});

describe('audit gate process entry and npm execution', () => {
  it('runs npm and reports a completed clean audit from a path requiring URL encoding', () => {
    const fixture = auditProcess(JSON.stringify({ vulnerabilities: {} }));
    const result = fixture.run();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK.*no unwaived production advisories/);
    expect(JSON.parse(readFileSync(fixture.calls, 'utf8'))).toEqual(['audit', '--omit=dev', '--json']);
  });

  it('launches the installed npm command when runAudit is called as an imported function', () => {
    const fixture = auditProcess(JSON.stringify({ vulnerabilities: {} }));
    const result = fixture.run(['--input-type=module', '-e', `const {runAudit}=await import(${JSON.stringify(pathToFileURL(fixture.gate).href)}); console.log(JSON.stringify(runAudit()));`]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ vulnerabilities: {} });
  });

  it('fails the process for an unwaived moderate advisory even when npm exits nonzero', () => {
    const fixture = auditProcess(reportWith('moderate'), 1);
    const result = fixture.run();
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/BLOCKING.*moderate.*fixture-package/);
    expect(result.stderr).toContain('GHSA-test-0000-0001');
    expect(result.stdout).not.toContain('OK');
  });

  it('preserves the policy allowing below-threshold reports despite npm exit one', () => {
    const fixture = auditProcess(reportWith('low'), 1);
    const result = fixture.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/OK.*no unwaived production advisories/);
  });

  it.each([
    ['registry error', JSON.stringify({ error: { code: 'ECONNREFUSED', message: 'Fixture registry unavailable' } }), 1],
    ['malformed JSON', 'not JSON', 1],
    ['empty failed command', '', 2],
  ])('fails closed for a %s without claiming a completed audit', (_name, report, npmExit) => {
    const fixture = auditProcess(String(report), Number(npmExit));
    const result = fixture.run();
    expect(result.status).not.toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.stdout).not.toContain('OK');
    expect(existsSync(fixture.calls)).toBe(true);
  });

  it('does not audit when consumers import its classification helpers', () => {
    const fixture = auditProcess(reportWith('critical'), 1);
    const result = fixture.run(['--input-type=module', '-e', `const {meetsThreshold}=await import(${JSON.stringify(pathToFileURL(fixture.gate).href)}); console.log(meetsThreshold('high'));`]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('true');
    expect(existsSync(fixture.calls)).toBe(false);
  });
});
