import { pathToFileURL } from 'node:url';

export async function verifyDeployment({ baseUrl, revision, backendUrl, fetchImpl = fetch }) {
  if (!/^[0-9a-f]{40}$/.test(revision || '')) throw new Error('Expected an exact Git revision');
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('Invalid deployment origin');
  const request = async url => {
    const response = await fetchImpl(url, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Deployment probe failed: HTTP ${response.status}`);
    return response;
  };
  const info = await request(new URL(`/build-info.json?revision=${revision}`, base));
  if (!info.headers.get('content-type')?.includes('application/json')) throw new Error('Build metadata is not JSON');
  if ((await info.json()).revision !== revision) throw new Error('Deployed revision mismatch');
  const shell = await request(base);
  if (!shell.headers.get('content-type')?.includes('text/html')) throw new Error('Application shell is not HTML');
  const html = await shell.text();
  if (!/id=["']root["']/.test(html)) throw new Error('Application root is absent');
  const entry = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/g)]
    .map(match => new URL(match[1], base)).find(url => url.origin === base.origin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.js'));
  if (!entry) throw new Error('Application entrypoint is absent');
  const script = await request(entry);
  if (!/(javascript|ecmascript)/i.test(script.headers.get('content-type') || '')) throw new Error('Application entrypoint is not JavaScript');
  if (!(await script.text()).trim()) throw new Error('Application entrypoint is empty');
  const backend = new URL(backendUrl);
  if (backend.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(backend.hostname) || backend.username || backend.password) throw new Error('Invalid backend origin');
  const health = await request(new URL('/functions/v1/health', backend));
  const readiness = await health.json();
  if (readiness.status !== 'ok' || readiness.db !== 'ok') throw new Error('Backend readiness failed');
  return { revision, origin: base.origin, backend: backend.origin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const evidence = await verifyDeployment({ baseUrl: process.env.DEPLOY_BASE_URL,
      revision: process.env.GITHUB_SHA, backendUrl: process.env.VITE_SUPABASE_URL });
    console.log(JSON.stringify(evidence));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
