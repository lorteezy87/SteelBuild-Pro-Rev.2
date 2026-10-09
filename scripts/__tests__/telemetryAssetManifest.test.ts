import { expect, it } from 'vitest';
import { build } from 'vite';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { telemetryAssetManifest } from '../vite/telemetryAssetManifest.ts';
import { parseTelemetryAssets } from '../../src/lib/telemetryAssetManifest.ts';

it('writes an inert exact emitted-JavaScript list into real Vite build HTML', async () => {
  const root = mkdtempSync(join(tmpdir(), 'sbp-telemetry-build-'));
  try {
    writeFileSync(join(root, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>');
    writeFileSync(join(root, 'main.ts'), 'document.body.onclick = () => import("./lazy.ts");');
    writeFileSync(join(root, 'lazy.ts'), 'export const value = "safe public code";');
    mkdirSync(join(root, 'public'));
    writeFileSync(join(root, 'public/private-unrelated.js'), 'not a generated chunk');
    const result = await build({ configFile: false, root, logLevel: 'silent', plugins: [telemetryAssetManifest()], build: { write: false, minify: false } });
    if (Array.isArray(result) || !('output' in result)) throw new Error('Unexpected build output');
    const htmlAsset = result.output.find(entry => entry.type === 'asset' && entry.fileName === 'index.html');
    if (!htmlAsset || htmlAsset.type !== 'asset') throw new Error('Missing build HTML');
    const html = String(htmlAsset.source);
    const raw = /<script id="sbp-telemetry-assets" type="application\/json">([^<]*)<\/script>/.exec(html)?.[1];
    expect(raw).toBeDefined();
    const files = parseTelemetryAssets(raw);
    expect(files).toEqual(result.output.filter(entry => entry.type === 'chunk').map(entry => '/' + entry.fileName).sort());
    expect(files.length).toBeGreaterThanOrEqual(2); expect(files).not.toContain('/private-unrelated.js');
    expect(html.indexOf('sbp-telemetry-assets')).toBeLessThan(html.indexOf('type="module"'));
  } finally {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('sbp-telemetry-build-')) throw new Error('Unsafe fixture cleanup target');
    rmSync(root, { recursive: true, force: true });
  }
});
