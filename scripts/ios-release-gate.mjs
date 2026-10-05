// Called by the manual iOS workflow before any signing credentials are used.
export function assertIosReleaseChecks(run, jobs, sha) {
  if (run.head_sha !== sha || run.head_branch !== 'main' || run.event !== 'push' || run.status !== 'completed') {
    throw new Error('A completed main-push CI run for this exact commit is required.');
  }
  const required = [
    'Lint + Typecheck + Test + Build',
    'Secret scan (gitleaks)',
    'Supabase drift check',
    'Release Edge Function typecheck',
  ];
  for (const name of required) {
    const matches = jobs.filter((job) => job.name === name);
    if (matches.length !== 1 || matches[0].status !== 'completed' || matches[0].conclusion !== 'success') {
      throw new Error(`Release blocked: ${name} must pass for this commit.`);
    }
  }
}
