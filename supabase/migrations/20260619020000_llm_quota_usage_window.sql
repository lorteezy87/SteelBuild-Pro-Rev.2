-- llm-proxy per-user quota: indexed, server-side usage aggregate.
--
-- Powers checkUserQuota in supabase/functions/llm-proxy/quota.ts. Instead of the
-- edge function fetching every telemetry row to sum client-side (subject to
-- PostgREST's row cap → silent undercount at scale, exactly when a spend cap
-- matters most), it calls this aggregate with the service-role key: one indexed
-- query returning the rolling-window request count + cost sum.

-- 1. Composite index for the (user_id, occurred_at) window lookup. The quota
--    read runs on the hot path of EVERY llm-proxy request, so this must be
--    indexed. Mirrors the existing use_case / provider / project indexes
--    (occurred_at DESC) on this table.
create index if not exists idx_llm_telemetry_user_occurred
  on public.llm_telemetry (user_id, occurred_at desc);

-- 2. Server-side usage aggregate. Returns exactly one row. SECURITY DEFINER
--    because it reads cross-user telemetry; pinned empty search_path so the body
--    can't be hijacked via a mutable search path (built-ins resolve from the
--    always-present pg_catalog; only the table is schema-qualified). STABLE — it
--    only reads.
create or replace function public.get_llm_usage_window(
  p_user_id uuid,
  p_since   timestamptz
)
returns table (request_count bigint, cost_sum numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*)::bigint                       as request_count,
    coalesce(sum(t.cost_usd), 0)::numeric  as cost_sum
  from public.llm_telemetry t
  where t.user_id = p_user_id
    and t.occurred_at >= p_since;
$$;

-- Least privilege: this exposes one user's aggregate spend, so lock it to the
-- service role (the gateway calls it with the service-role key). Strip the
-- default PUBLIC execute grant; no anon / authenticated access.
revoke all on function public.get_llm_usage_window(uuid, timestamptz) from public;
revoke all on function public.get_llm_usage_window(uuid, timestamptz) from anon, authenticated;
grant execute on function public.get_llm_usage_window(uuid, timestamptz) to service_role;

-- New RPC is reachable via PostgREST → reload the schema cache.
notify pgrst, 'reload schema';
