import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Emits SQL only; never opens a connection or reads credentials. Run exclusively
// on staging. The transaction rolls back every fixture and all setup DDL.
const migrationPath = 'supabase/migrations/20261009070300_submittal_round_revision_evidence.sql';
const migration = execFileSync('git', ['show', `HEAD:${migrationPath}`], { encoding: 'utf8' });
const sha256 = createHash('sha256').update(migration).digest('hex');
const fixture = await readFile(new URL('./hosted-fixture.sql', import.meta.url), 'utf8');
const cases = await readFile(new URL('./hosted-cases.sql', import.meta.url), 'utf8');
const legacyStart = "UPDATE public.submittals SET status='Submitted'";
const split = fixture.indexOf(legacyStart);
if (split < 0 || /(?:BEGIN|COMMIT|ROLLBACK)\s*;/i.test(fixture)) throw new Error('Unexpected fixture structure');
console.log(JSON.stringify({ sha256, query: `BEGIN;
SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('steelbuild-staging-round-acceptance',0));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261009070300'
  AND encode(extensions.digest(array_to_string(statements,E'\\n'),'sha256'),'hex')='${sha256}') THEN
  RAISE EXCEPTION 'Installed manifest ledger does not match this committed source'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.submittals'::regclass
  AND tgname='aaa_submittal_round_workflow' AND tgenabled='O') THEN
  RAISE EXCEPTION 'Expected installed workflow guard is not enabled'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'round-evidence-%@example.invalid')
  OR EXISTS(SELECT 1 FROM public.organizations WHERE id='ba090000-0000-4000-8000-000000000001') THEN
  RAISE EXCEPTION 'Synthetic fixture already exists; investigate'; END IF;
END $$;
${fixture.slice(0, split)}
-- Reproduce a PRE-migration legacy approval only during fixture setup. The
-- transaction's DDL lock prevents other sessions from observing this interval.
-- All other guards remain enabled; the new guard is restored before assertions.
ALTER TABLE public.submittals DISABLE TRIGGER aaa_submittal_round_workflow;
${fixture.slice(split)}
ALTER TABLE public.submittals ENABLE TRIGGER aaa_submittal_round_workflow;
${cases}
SELECT count(*) AS passed,jsonb_agg(name ORDER BY name) AS checks FROM round_test_results;
ROLLBACK;` }));
