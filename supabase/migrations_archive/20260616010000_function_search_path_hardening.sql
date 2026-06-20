-- Pin search_path on five recent public functions flagged by the Supabase
-- security advisor (lint 0011 function_search_path_mutable). All five are
-- trivial and reference no schema object — three updated_at touch triggers
-- (`new.updated_at = now()`) and two pure plan-limit lookups (a CASE over a
-- text arg) — so an empty search_path is fully safe (now() resolves from the
-- always-present pg_catalog) and removes the role-mutable-path hijack vector.
-- Matches the convention already used by the org-isolation helpers
-- (founding_org_id / user_is_org_member, both search_path = '').
--
-- Applied live 2026-06-16 via Supabase MCP.

ALTER FUNCTION public.backcharge_touch_updated_at() SET search_path = '';
ALTER FUNCTION public.payapp_touch_updated_at() SET search_path = '';
ALTER FUNCTION public.piece_production_touch_updated_at() SET search_path = '';
ALTER FUNCTION public.plan_member_limit(text) SET search_path = '';
ALTER FUNCTION public.plan_project_limit(text) SET search_path = '';
