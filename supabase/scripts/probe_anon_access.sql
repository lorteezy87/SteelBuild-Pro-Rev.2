-- ============================================================================
-- probe_anon_access.sql
--
-- Impersonate the anon role inside a transaction and try to SELECT from every
-- sensitive user-data table. With migration 011's policies in place, every
-- count should be 0 — because every policy is `TO authenticated` and anon
-- has no `auth.uid()`, so `USING (...)` evaluates to false for every row.
--
-- If ANY count returns > 0, that specific table has a policy that accepts
-- an anon-role request (or RLS is off on it). That IS an active leak and
-- needs an immediate policy fix on that table.
--
-- Run this in the Supabase SQL editor. The transaction rolls back at the
-- end so it's safe to run on prod.
-- ============================================================================

begin;

set local role anon;
set local jwt.claims.sub to '';   -- no authenticated user
set local jwt.claims.role to 'anon';

select 'projects'           as table_name, count(*) as visible_to_anon from projects
union all select 'rfis',                     count(*) from rfis
union all select 'drawings',                 count(*) from drawings
union all select 'drawing_sets',             count(*) from drawing_sets
union all select 'drawing_sheets',           count(*) from drawing_sheets
union all select 'drawing_findings',         count(*) from drawing_findings
union all select 'drawing_analyses',         count(*) from drawing_analyses
union all select 'deliveries',               count(*) from deliveries
union all select 'work_packages',            count(*) from work_packages
union all select 'schedule_tasks',           count(*) from schedule_tasks
union all select 'change_orders',            count(*) from change_orders
union all select 'change_requests',          count(*) from change_requests
union all select 'sov_items',                count(*) from sov_items
union all select 'expenses',                 count(*) from expenses
union all select 'documents',                count(*) from documents
union all select 'meetings',                 count(*) from meetings
union all select 'punchlist_items',          count(*) from punchlist_items
union all select 'inspections',              count(*) from inspections
union all select 'safety_incidents',         count(*) from safety_incidents
union all select 'contacts',                 count(*) from contacts
union all select 'look_ahead',               count(*) from look_ahead
union all select 'production_notes',         count(*) from production_notes
union all select 'user_projects',            count(*) from user_projects
union all select 'ai_audit_log',             count(*) from ai_audit_log
union all select 'number_sequences',         count(*) from number_sequences
union all select 'action_items',             count(*) from action_items
union all select 'activities',               count(*) from activities
union all select 'alerts',                   count(*) from alerts
union all select 'daily_logs',               count(*) from daily_logs
union all select 'delivery_items',           count(*) from delivery_items
union all select 'photos',                   count(*) from photos
union all select 'project_closeout',         count(*) from project_closeout
union all select 'project_handoff_items',    count(*) from project_handoff_items
union all select 'quality_control_records',  count(*) from quality_control_records
union all select 'resources',                count(*) from resources
union all select 'scope_items',              count(*) from scope_items
union all select 'uploaded_files',           count(*) from uploaded_files
union all select 'user_profiles',            count(*) from user_profiles
union all select 'vendors',                  count(*) from vendors
union all select 'warranties',               count(*) from warranties
union all select 'drawing_activity',         count(*) from drawing_activity
union all select 'drawing_revision_comparisons', count(*) from drawing_revision_comparisons
union all select 'drawing_revision_deltas',  count(*) from drawing_revision_deltas
union all select 'mitigation_actions',       count(*) from mitigation_actions
union all select 'mitigation_logs',          count(*) from mitigation_logs
union all select 'cost_codes',               count(*) from cost_codes
order by table_name;

rollback;
