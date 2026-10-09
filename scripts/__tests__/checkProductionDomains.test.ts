import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { entryAssetPath, verifyDomain, type ReleaseAsset } from '../check-production-domains.ts';

const script = '/assets/index-good.js';
const bytes = 'console.log("released")';
const expected: ReleaseAsset = {
  path: script,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};

const html = (path: string) =>
  `<!doctype html><script type="module" crossorigin src="${path}"></script>`;

function fakeHost(servedPath = script, servedBytes = bytes) {
  return vi.fn(async (input: unknown) => {
    const url = new URL(String(input));
    if (url.pathname === '/') {
      return new Response(html(servedPath), {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response(servedBytes, {
      status: 200,
      headers: { 'content-type': 'text/javascript' },
    });
  }) as unknown as typeof fetch;
}

describe('production domain release verification', () => {
  it('accepts the exact release entry and bytes', async () => {
    const fetcher = fakeHost();
    await expect(verifyDomain('https://www.steelbuild-pro.com', expected, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects a different HTTP 200 app shell before fetching its asset', async () => {
    const fetcher = fakeHost('/assets/index-from-other-host.js');
    await expect(verifyDomain('https://www.steelbuild-pro.com', expected, fetcher)).rejects.toThrow(
      'expected /assets/index-good.js',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects a matching asset name with different contents', async () => {
    await expect(verifyDomain('https://steelbuild-pro.com', expected, fakeHost(script, 'stale')))
      .rejects.toThrow('bytes differ');
  });

  it('requires a single local Vite module entry', () => {
    expect(entryAssetPath(html(script))).toBe(script);
    expect(() => entryAssetPath(html('https://other.example/assets/index-good.js'))).toThrow();
    expect(() => entryAssetPath(`${html(script)}${html(script)}`)).toThrow();
  });
});
