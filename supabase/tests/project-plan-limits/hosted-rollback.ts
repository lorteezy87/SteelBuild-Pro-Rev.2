import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Generates reviewable SQL only. It never reads credentials or connects.
const migration=await readFile(new URL('../../migrations/20261009140000_enforce_project_plan_limits.sql',import.meta.url),'utf8');
const cases=await readFile(new URL('./hosted-cases.sql',import.meta.url),'utf8');
if(/^\s*(?:begin|commit|rollback)\s*;/im.test(migration)) throw new Error('Candidate may not end the rehearsal transaction');
const sha256=createHash('sha256').update(migration).digest('hex');
console.log(JSON.stringify({sha256,query:`BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('steelbuild-staging-project-cap-acceptance',0));
DO $$ BEGIN
 IF to_regprocedure('public.enforce_project_plan_limit()') IS NOT NULL
    OR EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261009140000') THEN
   RAISE EXCEPTION 'Candidate already installed; use installed-candidate acceptance';
 END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE email LIKE 'project-cap-%@example.invalid')
    OR EXISTS(SELECT 1 FROM public.organizations WHERE id IN ('ca090000-0000-4000-8000-000000000001','ca090000-0000-4000-8000-000000000002')) THEN
   RAISE EXCEPTION 'Synthetic fixture already exists; investigate';
 END IF;
END $$;
${migration}
${cases}
ROLLBACK;
SELECT jsonb_build_object(
 'candidate_sha256','${sha256}','checks_passed',18,
 'candidate_absent',to_regprocedure('public.enforce_project_plan_limit()') IS NULL,
 'ledger_absent',NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261009140000'),
 'synthetic_users_remaining',(SELECT count(*) FROM auth.users WHERE email LIKE 'project-cap-%@example.invalid'),
 'synthetic_orgs_remaining',(SELECT count(*) FROM public.organizations WHERE id IN ('ca090000-0000-4000-8000-000000000001','ca090000-0000-4000-8000-000000000002')),
 'synthetic_projects_remaining',(SELECT count(*) FROM public.projects WHERE org_id IN ('ca090000-0000-4000-8000-000000000001','ca090000-0000-4000-8000-000000000002'))
) acceptance;` }));
