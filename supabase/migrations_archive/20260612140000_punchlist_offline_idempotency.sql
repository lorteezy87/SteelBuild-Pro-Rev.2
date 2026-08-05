-- Field offline outbox, slice 2: dedup-safe replay of an offline-created
-- punchlist item.
--
-- A CREATE made with no signal is queued client-side and replayed on reconnect.
-- Unlike a progress UPDATE (idempotent), replaying a CREATE would mint a
-- duplicate row if the first attempt actually reached the server but its
-- response was lost. We make the replay exactly-once with a CLIENT-generated
-- idempotency key: the same client_op_id rides both the online attempt and the
-- queued retry, and this partial-unique index turns a duplicate replay into a
-- 23505 the client treats as "already applied".
--
-- Nullable + partial-unique: only offline-origin rows carry a key; the millions
-- of normal NULL rows never collide. Purely additive — no RLS change (the
-- existing >=field insert policy already governs who can create a punch).

alter table public.punchlist_items
  add column if not exists client_op_id uuid;

create unique index if not exists uq_punchlist_items_client_op_id
  on public.punchlist_items (client_op_id)
  where client_op_id is not null;

comment on column public.punchlist_items.client_op_id is
  'Client idempotency key for offline-queued creates (Field Today outbox). Null for rows created online.';

notify pgrst, 'reload schema';
