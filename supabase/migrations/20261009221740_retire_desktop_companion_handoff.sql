-- Owner discontinued the companion app. Preserve historical records and
-- schema for controlled retention/recovery; revoke all runtime entrypoints.
begin;
revoke all on function public.create_desktop_session_handoff(text, uuid, text, text, jsonb, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_desktop_session_handoff(text, text)
  from public, anon, authenticated, service_role;
revoke all on table private.desktop_session_handoffs
  from public, anon, authenticated, service_role;
commit;
