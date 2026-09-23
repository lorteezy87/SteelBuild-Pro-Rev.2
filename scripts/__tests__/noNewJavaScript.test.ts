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

/**
 * A branch push's `before` can be an old head of the branch that main has since
 * merged. main then added `src/fromMain.js`; the branch adds only `extension`.
 */
function staleBranchFixture(extension: string) {
  const cwd = mkdtempSync(join(tmpdir(), 'steelbuild-js-gate-'));
  directories.push(cwd);
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'user.name', 'Test fixture');
  git('commit', '--allow-empty', '-m', 'old branch head, merged into main');
  const staleBefore = git('rev-parse', 'HEAD');
  mkdirSync(join(cwd, 'src'));
  writeFileSync(join(cwd, 'src', 'fromMain.js'), 'export const main = 1;\n');
  git('add', 'src');
  git('commit', '-m', 'main adds a JS file (allowlisted at the time)');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const run = () => spawnSync(process.execPath, [script], { cwd, env: { ...process.env, NO_NEW_JS_BASE: staleBefore }, encoding: 'utf8' });
  const addOnBranch = () => {
    writeFileSync(join(cwd, 'src', `branch.${extension}`), 'export const value = 1;\n');
    git('add', 'src');
    git('commit', '-m', 'branch work');
  };
  return { run, addOnBranch };
}

describe('stale push `before` that main already contains', () => {
  it("does not blame the branch for main's own files", () => {
    const { run, addOnBranch } = staleBranchFixture('ts');
    addOnBranch();
    const result = run();
    expect(result.stderr).not.toContain('src/fromMain.js');
    expect(result.status).toBe(0);
  });
  it('still rejects JS the branch itself adds', () => {
    const { run, addOnBranch } = staleBranchFixture('jsx');
    addOnBranch();
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/branch.jsx');
    expect(result.stderr).not.toContain('src/fromMain.js');
  });
  it('keeps the before SHA on a push to main itself', () => {
    const { run } = staleBranchFixture('ts');
    const result = run(); // HEAD is origin/main
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/fromMain.js');
  });
});
