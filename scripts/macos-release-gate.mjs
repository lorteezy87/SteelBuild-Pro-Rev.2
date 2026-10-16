import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Both signed validation and upload require the exact source commit's production checks.
export function assertMacReleaseChecks(run, jobs, sha, branch, upload) {
  if (upload && branch !== 'main') throw new Error('Mac uploads must use main.');
  if (run.head_sha !== sha || run.head_branch !== branch || run.status !== 'completed' ||
      !['push', 'pull_request'].includes(run.event) || (upload && run.event !== 'push')) {
    throw new Error('A completed CI run for this exact source commit is required.');
  }
  for (const name of ['Lint + Typecheck + Test + Build', 'Secret scan (gitleaks)',
    'Supabase drift check', 'Release Edge Function typecheck',
    'Commercial SQL + concurrent PostgreSQL acceptance']) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') {
      throw new Error(`Mac release blocked: ${name} must pass.`);
    }
  }
}

export async function assertMacUploadMain(repository, sha, token, fetcher = fetch) {
  if (!repository || !sha || !token) throw new Error('GitHub source verification configuration is missing.');
  const response = await fetcher(`https://api.github.com/repos/${repository}/branches/main`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Cannot confirm current main: HTTP ${response.status}.`);
  const branch = await response.json();
  if (branch.commit?.sha !== sha) throw new Error('Main changed during release preparation. Start a new Mac release.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== '--check-current-main') throw new Error('Expected --check-current-main.');
  await assertMacUploadMain(process.env.GITHUB_REPOSITORY, process.env.GITHUB_SHA, process.env.GH_TOKEN);
}
