import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_DOMAINS = [
  'https://steelbuild-pro.com',
  'https://www.steelbuild-pro.com',
] as const;

export interface ReleaseAsset {
  path: string;
  sha256: string;
}

const digest = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

/** Vite's module entry links every content-hashed application chunk. */
export function entryAssetPath(html: string): string {
  const entries = [...html.matchAll(/<script\b[^>]*>/gi)]
    .map(([tag]) => {
      if (!/\btype\s*=\s*["']module["']/i.test(tag)) return null;
      return tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
    })
    .filter((path): path is string => path !== null);

  if (entries.length !== 1 || !/^\/assets\/[A-Za-z0-9._-]+\.js$/.test(entries[0])) {
    throw new Error('Expected exactly one local Vite module entry under /assets/');
  }
  return entries[0];
}

export async function expectedRelease(distDirectory: string): Promise<ReleaseAsset> {
  const html = await readFile(resolve(distDirectory, 'index.html'), 'utf8');
  const path = entryAssetPath(html);
  const bytes = await readFile(resolve(distDirectory, `.${path}`));
  return { path, sha256: digest(bytes) };
}

/** A 200 from a different host or a stale SPA shell must fail the release. */
export async function verifyDomain(
  baseUrl: string,
  expected: ReleaseAsset,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const pageUrl = new URL('/', baseUrl);
  pageUrl.searchParams.set('_sb_release_check', randomUUID());
  const page = await fetcher(pageUrl, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (page.status !== 200) throw new Error(`HTML returned HTTP ${page.status}`);
  if (!(page.headers.get('content-type') ?? '').includes('text/html')) {
    throw new Error('HTML response has the wrong content type');
  }

  const servedPath = entryAssetPath(await page.text());
  if (servedPath !== expected.path) {
    throw new Error(`served ${servedPath}; expected ${expected.path}`);
  }

  const asset = await fetcher(new URL(servedPath, baseUrl), {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  });
  if (asset.status !== 200) throw new Error(`entry asset returned HTTP ${asset.status}`);
  if (!/javascript|ecmascript/i.test(asset.headers.get('content-type') ?? '')) {
    throw new Error('entry asset has the wrong content type');
  }
  if (digest(new Uint8Array(await asset.arrayBuffer())) !== expected.sha256) {
    throw new Error('entry asset bytes differ from the gated release build');
  }
}

async function main(): Promise<void> {
  const expected = await expectedRelease(resolve('dist'));
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const results = await Promise.allSettled(
      PRODUCTION_DOMAINS.map((domain) => verifyDomain(domain, expected)),
    );
    const failures = results.flatMap((result, index) =>
      result.status === 'rejected'
        ? [`${PRODUCTION_DOMAINS[index]}: ${String(result.reason)}`]
        : [],
    );
    if (failures.length === 0) {
      console.log(`Both production domains serve ${expected.path} from this release.`);
      return;
    }
    console.error(`Attempt ${attempt}/6: ${failures.join(' | ')}`);
    if (attempt < 6) await delay(10_000);
  }
  throw new Error('Production domain release verification failed');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
