import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { expect, it } from 'vitest';

it('refuses an occupied development port rather than changing the browser origin', async () => {
  const occupied = createServer();
  await new Promise<void>(resolve => occupied.listen(0, '127.0.0.1', resolve));
  const address = occupied.address();
  if (!address || typeof address === 'string') throw new Error('Expected a local TCP port');
  const child = spawn(process.execPath, [path.resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(address.port)], {
    env: { ...process.env, VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'no-network-fixture' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await new Promise<number | string>((resolve, reject) => {
      timer = setTimeout(() => resolve('timed out'), 15_000);
      const capture = (chunk: Buffer) => {
        output += chunk.toString();
        if (/Local:.*http/.test(output)) resolve('started on a different origin');
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.once('error', reject);
      child.once('exit', code => resolve(code ?? 'terminated'));
    });
    expect(result).toBe(1);
    expect(output).toMatch(/port .*already in use/i);
  } finally {
    if (timer) clearTimeout(timer);
    child.kill();
    await new Promise<void>(resolve => occupied.close(() => resolve()));
  }
}, 20_000);
