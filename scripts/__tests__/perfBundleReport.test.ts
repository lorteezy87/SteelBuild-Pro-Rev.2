import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../perf-bundle-report.cjs', import.meta.url));
const roots: string[] = [];
const budgetNames = ['SBP_MAX_INITIAL_GZIP_KB', 'SBP_MAX_TOTAL_GZIP_KB', 'SBP_MAX_WASM_GZIP_KB'];

function fixture(files: Record<string, Buffer | string> = { 'assets/index-test.js': 'boot' }) {
  const root = mkdtempSync(join(tmpdir(), 'steelbuild bundle # '));
  roots.push(root);
  mkdirSync(join(root, 'dist', 'assets'), { recursive: true });
  const put = (name: string, bytes: Buffer | string) => {
    const target = join(root, 'dist', name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  };
  put('index.html', '<script type="module" src="/assets/index-test.js"></script>');
  for (const [name, bytes] of Object.entries(files)) put(name, bytes);
  const run = (overrides: Record<string, string> = {}) => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (budgetNames.includes(key.toUpperCase())) delete env[key];
    const result = spawnSync(process.execPath, [script], {
      cwd: root, env: { ...env, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 15_000,
    });
    expect(result.error).toBeUndefined();
    return result;
  };
  return { put, run };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir())) throw new Error('Unexpected bundle fixture cleanup path');
    rmSync(root, { recursive: true, force: true });
  }
});

it('preserves the JS/CSS cap while reporting separately budgeted hashed WASM and combined bytes', () => {
  const boot = randomBytes(120 * 1024), lazy = randomBytes(3100 * 1024), wasm = randomBytes(480 * 1024);
  const f = fixture({ 'assets/index-test.js': boot, 'assets/lazy-test.js': lazy, 'assets/web-ifc-hash.wasm': wasm });
  const result = f.run();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('initial JS/CSS <= 320 KiB gzip, all JS/CSS <= 3600 KiB gzip, WASM <= 500 KiB gzip');
  const expectedCombined = ((gzipSync(boot).length + gzipSync(lazy).length + gzipSync(wasm).length) / 1024).toFixed(1);
  expect(result.stdout).toMatch(new RegExp(`Combined JS/CSS/WASM: .* / ${expectedCombined.replace('.', '\\.')} KiB gzip`));
});

it('counts an oversized WASM outside assets instead of silently excluding the legacy directory', () => {
  const result = fixture({ 'assets/index-test.js': 'boot', 'wasm/legacy/deeper/web-ifc.wasm': randomBytes(501 * 1024) }).run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('WASM gzip budget exceeded');
  expect(result.stdout).toContain('wasm/legacy/deeper/web-ifc.wasm');
});

it('counts identical WASM copies at hashed and legacy paths independently', () => {
  const wasm = randomBytes(300 * 1024);
  const result = fixture({ 'assets/index-test.js': 'boot', 'assets/web-ifc-hash.wasm': wasm, 'wasm/web-ifc.wasm': wasm }).run();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('WASM gzip budget exceeded');
});

it('still rejects JS/CSS beyond their independent budget, including nested generated chunks', () => {
  const result = fixture({ 'assets/index-test.js': 'boot', 'assets/chunks/lazy.js': randomBytes(2 * 1024) }).run({ SBP_MAX_TOTAL_GZIP_KB: '1' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('JS/CSS gzip budget exceeded');
});

it('still rejects an oversized initial HTML asset even when the total budgets permit it', () => {
  const result = fixture({ 'assets/index-test.js': randomBytes(2 * 1024) }).run({ SBP_MAX_INITIAL_GZIP_KB: '1' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('initial gzip budget exceeded');
});

it('counts initial JS and CSS once even when HTML references repeat', () => {
  const js = randomBytes(1024), css = randomBytes(1024), f = fixture({ 'assets/index-test.js': js, 'assets/style-test.css': css });
  f.put('index.html', '<script src="/assets/index-test.js"></script><link rel="modulepreload" href="/assets/index-test.js"><link rel="stylesheet" href="/assets/style-test.css">');
  const exact = String((gzipSync(js).length + gzipSync(css).length) / 1024);
  expect(f.run({ SBP_MAX_INITIAL_GZIP_KB: exact }).status).toBe(0);
  expect(f.run({ SBP_MAX_INITIAL_GZIP_KB: String(Number(exact) - 0.001) }).status).toBe(1);
});

it.each(budgetNames.flatMap(name => ['', ' ', 'NaN', 'Infinity', '-1', '0', '12garbage'].map(value => [name, value])))('fails closed for invalid %s=%j', (name, value) => {
  const result = fixture().run({ [name]: value });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(`Invalid ${name}`);
});
