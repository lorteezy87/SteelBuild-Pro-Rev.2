import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve('scripts/check-no-new-js.mjs');
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function fixture(extension: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'steelbuild-js-gate-'));
  directories.push(cwd);
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Test fixture');
  git('commit', '--allow-empty', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  mkdirSync(join(cwd, 'src'));
  writeFileSync(join(cwd, 'src', `added.${extension}`), 'export const value = 1;\n');
  git('add', 'src');
  git('commit', '-m', 'add source');
  return { cwd, base };
}

describe('no-new-JavaScript gate using real git history', () => {
  it('rejects a new JS file against the before SHA of a main push', () => {
    const { cwd, base } = fixture('js');
    const result = spawnSync(process.execPath, [script], { cwd, env: { ...process.env, NO_NEW_JS_BASE: base }, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/added.js');
  });
  it('accepts new TypeScript', () => {
    const { cwd, base } = fixture('ts');
    expect(spawnSync(process.execPath, [script], { cwd, env: { ...process.env, NO_NEW_JS_BASE: base } }).status).toBe(0);
  });
  it('fails when the comparison ref was not fetched', () => {
    const { cwd } = fixture('ts');
    const result = spawnSync(process.execPath, [script], { cwd, env: { ...process.env, NO_NEW_JS_BASE: 'refs/heads/missing' }, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Fetch the base ref');
  });
});
