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
