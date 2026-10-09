import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Prints a reviewable query; never connects to a database or reads credentials.
// Execute only against the explicitly selected staging branch. All DDL and
// synthetic Auth, Storage metadata and application rows are rolled back.
const migration = await readFile(new URL('../../migrations/20261009070300_submittal_round_revision_evidence.sql', import.meta.url), 'utf8');
const before = await readFile(new URL('./hosted-fixture.sql', import.meta.url), 'utf8');
const cases = await readFile(new URL('./hosted-cases.sql', import.meta.url), 'utf8');
if (/^\s*(?:begin|commit|rollback)\s*;/im.test(migration)) throw new Error('Candidate must not end the enclosing rollback transaction');
const sha256 = createHash('sha256').update(migration).digest('hex');
console.log(JSON.stringify({ sha256, query: `BEGIN;
SET LOCAL lock_timeout='8s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('steelbuild-staging-round-acceptance',0));
DO $$ BEGIN
 IF to_regclass('public.submittal_round_revision_evidence') IS NOT NULL
   OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261009070300') THEN
   RAISE EXCEPTION 'Use a separate installed-candidate acceptance after migration deployment';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'round-evidence-%@example.invalid')
   OR EXISTS(SELECT 1 FROM public.organizations WHERE id='ba090000-0000-4000-8000-000000000001') THEN
   RAISE EXCEPTION 'Synthetic fixture already exists; investigate before running';
 END IF;
END $$;
${before}
${migration}
${cases}
ROLLBACK;
SELECT jsonb_build_object(
 'candidate_sha256','${sha256}', 'checks_passed',28,
 'candidate_absent',to_regclass('public.submittal_round_revision_evidence') IS NULL,
 'ledger_absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261009070300'),
 'synthetic_users_remaining',(SELECT count(*) FROM auth.users WHERE email LIKE 'round-evidence-%@example.invalid'),
 'synthetic_orgs_remaining',(SELECT count(*) FROM public.organizations WHERE id='ba090000-0000-4000-8000-000000000001'),
 'synthetic_projects_remaining',(SELECT count(*) FROM public.projects WHERE id='ba090000-0000-4000-8000-000000000002'),
 'synthetic_storage_remaining',(SELECT count(*) FROM storage.objects WHERE name='ba090000-0000-4000-8000-000000000001/uploads/round-evidence.pdf')
) AS acceptance;` }));
