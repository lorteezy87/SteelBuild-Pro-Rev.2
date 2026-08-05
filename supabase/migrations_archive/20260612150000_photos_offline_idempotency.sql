-- Field offline outbox, slice 3: dedup-safe replay of an offline-captured photo.
--
-- Same idempotency contract as the punch create (see 20260612140000): a photo
-- snapped with no signal is held client-side (the compressed blob in IndexedDB,
-- a create op in the localStorage outbox) and replayed on reconnect. The shared
-- client_op_id rides the online create AND the queued retry, so a replay whose
-- first attempt already landed collides with this partial-unique index (23505)
-- and is treated as already-applied instead of minting a duplicate Photo row.
--
-- Nullable + partial-unique: only offline-origin photos carry a key. Purely
-- additive — no RLS change (the existing >=field insert policy still governs).

alter table public.photos
  add column if not exists client_op_id uuid;

create unique index if not exists uq_photos_client_op_id
  on public.photos (client_op_id)
  where client_op_id is not null;

comment on column public.photos.client_op_id is
  'Client idempotency key for offline-queued photo creates (Field Today outbox). Null for rows created online.';

notify pgrst, 'reload schema';
