begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.desktop_session_handoffs (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  state text not null,
  code_challenge text not null,
  encrypted_session jsonb not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint desktop_session_handoffs_code_hash_check
    check (code_hash ~ '^[A-Za-z0-9_-]{43}$'),
  constraint desktop_session_handoffs_state_check
    check (state ~ '^[A-Za-z0-9_-]{32,128}$'),
  constraint desktop_session_handoffs_code_challenge_check
    check (code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
  constraint desktop_session_handoffs_envelope_check
    check (jsonb_typeof(encrypted_session) = 'object'),
  constraint desktop_session_handoffs_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '2 minutes'
    ),
  constraint desktop_session_handoffs_consumed_check
    check (consumed_at is null or consumed_at >= created_at)
);

alter table private.desktop_session_handoffs enable row level security;
revoke all on table private.desktop_session_handoffs
  from public, anon, authenticated, service_role;

create index if not exists desktop_session_handoffs_expires_at_idx
  on private.desktop_session_handoffs (expires_at);

create or replace function public.create_desktop_session_handoff(
  p_code_hash text,
  p_user_id uuid,
  p_state text,
  p_code_challenge text,
  p_encrypted_session jsonb,
  p_created_at timestamptz,
  p_expires_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_expiry timestamptz;
begin
  delete from private.desktop_session_handoffs
  where expires_at <= clock_timestamp()
     or consumed_at < clock_timestamp() - interval '5 minutes';

  insert into private.desktop_session_handoffs (
    code_hash,
    user_id,
    state,
    code_challenge,
    encrypted_session,
    created_at,
    expires_at
  ) values (
    p_code_hash,
    p_user_id,
    p_state,
    p_code_challenge,
    p_encrypted_session,
    p_created_at,
    p_expires_at
  )
  returning expires_at into inserted_expiry;

  return inserted_expiry;
end;
$$;

revoke all on function public.create_desktop_session_handoff(
  text, uuid, text, text, jsonb, timestamptz, timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.create_desktop_session_handoff(
  text, uuid, text, text, jsonb, timestamptz, timestamptz
) to service_role;

create or replace function public.consume_desktop_session_handoff(
  p_code_hash text,
  p_code_challenge text
)
returns table (
  state text,
  encrypted_session jsonb
)
language sql
security definer
set search_path = ''
as $$
  update private.desktop_session_handoffs handoff
     set consumed_at = clock_timestamp()
   where handoff.code_hash = p_code_hash
     and handoff.code_challenge = p_code_challenge
     and handoff.consumed_at is null
     and handoff.expires_at > clock_timestamp()
  returning handoff.state, handoff.encrypted_session;
$$;

revoke all on function public.consume_desktop_session_handoff(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_desktop_session_handoff(text, text)
  to service_role;

commit;
