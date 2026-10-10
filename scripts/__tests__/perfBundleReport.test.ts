import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const reporter = resolve('scripts/perf-bundle-report.cjs');
function report(html: string, loadedBytes = 10, lazyBytes = 4096) {
  const directory = mkdtempSync(join(tmpdir(), 'steelbuild-perf-'));
  try {
    mkdirSync(join(directory, 'dist/assets'), { recursive: true });
    writeFileSync(join(directory, 'dist/index.html'), html);
    writeFileSync(join(directory, 'dist/assets/entry.js'), randomBytes(loadedBytes));
    writeFileSync(join(directory, 'dist/assets/lazy.js'), randomBytes(lazyBytes));
    writeFileSync(join(directory, 'dist/assets/lazy.css'), randomBytes(lazyBytes));
    return spawnSync(process.execPath, [reporter], {
      cwd: directory, encoding: 'utf8', timeout: 15_000,
      env: { ...process.env, SBP_MAX_INITIAL_GZIP_KB: '1', SBP_MAX_TOTAL_GZIP_KB: '10' },
    });
  } finally {
    const cleanupTarget = resolve(directory);
    const allowedPrefix = `${resolve(tmpdir())}${sep}steelbuild-perf-`;
    if (cleanupTarget !== directory || !cleanupTarget.startsWith(allowedPrefix)
      || cleanupTarget.slice(allowedPrefix.length).includes(sep)) {
      throw new Error('Refusing cleanup outside the allocated bundle-test directory');
    }
    rmSync(cleanupTarget, { recursive: true, force: true });
  }
}

describe('bundle reporter actual CLI asset accounting', () => {
  it('does not charge inert JSON/inline text assets to the initial fetch budget', () => {
    const result = report(`<script type="application/json">{"files":["/assets/lazy.js"]}</script>
      <script>const unused = '<script src="/assets/lazy.js">';</script>
      <!-- <script src="/assets/lazy.js"></script> -->
      <div data-path="/assets/lazy.js"></div>
      <script type="module" src="/assets/entry.js"></script>`);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('initial <= 1 KB gzip, total <= 10 KB gzip');
  });
  it('continues to fail when a real loaded script exceeds the initial budget', () => {
    const result = report('<script src="/assets/entry.js"></script>', 4096);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('initial gzip budget exceeded');
  });
  it('continues to count every generated asset toward the total budget', () => {
    const result = report('<script src="/assets/entry.js"></script>', 10, 20_000);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('total gzip budget exceeded');
  });
});

describe('initial HTML asset tag discovery', () => {
  it.each([
    ["module script, single quote", "<SCRIPT crossorigin SRC='/assets/lazy.js' TYPE=module></SCRIPT>"],
    ['module preload, attribute order', '<link href="/assets/lazy.js" crossorigin rel="modulepreload">'],
    ['stylesheet, single quote', "<link rel='stylesheet' href='/assets/lazy.css'>"],
    ['script preload, unquoted', '<link rel=preload as=script href=/assets/lazy.js>'],
    ['prefetch', '<link rel=prefetch href="/assets/lazy.js">'],
    ['relative script with query and fragment', '<script src="assets/lazy.js?v=1&amp;lang=en#ignored"></script>'],
  ])('counts real fetched %s', (_label, html) => {
    const result = report(html);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('initial gzip budget exceeded');
  });
  it('does not mistake inline strings, escaped HTML, non-fetch attributes or data scripts for fetches', () => {
    const result = report(`
      <script type="application/json">{"files":["/assets/lazy.js"]}</script>
      <script>const html = '<link rel="stylesheet" href="/assets/lazy.css">';</script>
      <!-- <script src='/assets/lazy.js'></script> -->
      <template><script src='/assets/lazy.js'></script></template>
      <script type="application/json" src="/assets/lazy.js"></script>
      <link rel=canonical href=/assets/lazy.js>
      <a href="/assets/lazy.js">Download</a>
      <div data-path="/assets/lazy.js">&lt;script src="/assets/lazy.js"&gt;</div>
      <script src="https://external.invalid/assets/lazy.js"></script>
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Initial HTML assets: 0.0 KB raw / 0.0 KB gzip');
  });
  it('does not execute scripts or resource handlers while parsing the build', () => {
    const result = report('<script>throw new Error("must never run")</script><script src=/assets/entry.js onload="throw 1"></script>');
    expect(result.status, result.stderr).toBe(0);
  });
});
