-- `public.piece_events` is a high-volume audit trail. Live production preflight
-- on 2026-09-21 found 4,755 rows with no NULL/duplicate IDs, no inbound foreign
-- keys, no primary key, and two structurally identical piece/created_at indexes.
--
-- Keep this migration fail-closed: do not create a primary key if the observed
-- data shape has changed, and do not remove the named index unless its retained
-- counterpart is still structurally identical.

DO $$
DECLARE
  v_null_ids bigint;
  v_duplicate_ids boolean;
  v_has_primary_key boolean;
  v_redundant_index_matches boolean;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE id IS NULL),
    EXISTS (
      SELECT 1
      FROM public.piece_events
      GROUP BY id
      HAVING COUNT(*) > 1
    )
  INTO v_null_ids, v_duplicate_ids
  FROM public.piece_events;

  IF v_null_ids > 0 OR v_duplicate_ids THEN
    RAISE EXCEPTION 'piece_events.id must contain no NULL or duplicate values before adding its primary key';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.piece_events'::regclass
      AND contype = 'p'
  )
  INTO v_has_primary_key;

  IF NOT v_has_primary_key THEN
    ALTER TABLE public.piece_events
      ADD CONSTRAINT piece_events_pkey PRIMARY KEY (id);
  END IF;

  IF to_regclass('public.idx_piece_events_piece') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_index redundant
      JOIN pg_index retained
        ON retained.indrelid = redundant.indrelid
       AND retained.indnkeyatts = redundant.indnkeyatts
       AND retained.indkey = redundant.indkey
       AND retained.indclass = redundant.indclass
       AND retained.indcollation = redundant.indcollation
       AND retained.indoption = redundant.indoption
       AND retained.indpred IS NOT DISTINCT FROM redundant.indpred
       AND retained.indexrelid = 'public.piece_events_piece_created_at_idx'::regclass
      WHERE redundant.indexrelid = 'public.idx_piece_events_piece'::regclass
    )
    INTO v_redundant_index_matches;

    IF NOT v_redundant_index_matches THEN
      RAISE EXCEPTION 'idx_piece_events_piece no longer matches piece_events_piece_created_at_idx; refusing to remove it';
    END IF;
  END IF;
END
$$;

DROP INDEX IF EXISTS public.idx_piece_events_piece;
