import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const runner = fileURLToPath(new URL('../storage-backup.mjs', import.meta.url));

function runWithoutCredentials(context: Record<string, string>) {
  // An actual process invocation proves refusal happens before configuration,
  // temporary credential files, or offsite clients can be used.
  return spawnSync(process.execPath, [runner], {
    env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, ...context },
    encoding: 'utf8', timeout: 10_000, windowsHide: true,
  });
}

describe('production backup entrypoint trust boundary', () => {
  it.each([
    ['refs/heads/feature', 'workflow_dispatch'],
    ['refs/heads/feature', 'schedule'],
    ['refs/tags/main', 'workflow_dispatch'],
    ['', 'workflow_dispatch'],
    ['refs/heads/main', 'pull_request'],
    ['refs/heads/main', 'push'],
    ['refs/heads/main', ''],
  ])('refuses %s / %s before loading credentials', (ref, event) => {
    const result = runWithoutCredentials({ GITHUB_ACTIONS: 'true', GITHUB_REF: ref, GITHUB_EVENT_NAME: event });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Production Storage backups require main and a scheduled or manual dispatch');
    expect(result.stderr).not.toContain('Missing required Storage backup configuration');
  });

  it.each(['schedule', 'workflow_dispatch'])('permits main / %s to reach configuration validation', (event) => {
    const result = runWithoutCredentials({ GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: event });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required Storage backup configuration');
    expect(result.stderr).not.toContain('Production Storage backups require main');
  });

  it('preserves explicit local operator execution outside GitHub Actions', () => {
    const result = runWithoutCredentials({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing required Storage backup configuration');
  });
});
