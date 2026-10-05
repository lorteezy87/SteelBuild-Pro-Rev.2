-- `public.piece_events` is a high-volume audit trail. Live production preflight
-- on 2026-09-21 found 4,755 rows with no NULL/duplicate IDs, no inbound foreign
-- keys, no primary key, and two structurally identical piece/created_at indexes.
-- A 2026-10-05 preflight found production already has the id primary key and
-- only idx_piece_events_piece. Preserve either usable index when it is alone.
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
  v_redundant_index regclass := to_regclass('public.idx_piece_events_piece');
  v_retained_index regclass := to_regclass('public.piece_events_piece_created_at_idx');
  v_usable_index regclass;
BEGIN
  -- Keep the data/catalog preflight and the conditional DDL in one atomic block.
  LOCK TABLE public.piece_events IN SHARE ROW EXCLUSIVE MODE;
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

  IF v_has_primary_key AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.piece_events'::regclass AND contype = 'p'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                         WHERE attrelid = 'public.piece_events'::regclass AND attname = 'id')]
  ) THEN
    RAISE EXCEPTION 'piece_events has a primary key other than id; refusing to change its identity';
  END IF;

  IF NOT v_has_primary_key THEN
    ALTER TABLE public.piece_events
      ADD CONSTRAINT piece_events_pkey PRIMARY KEY (id);
  END IF;

  v_usable_index := coalesce(v_retained_index, v_redundant_index);
  IF v_usable_index IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_index idx
    JOIN pg_class index_class ON index_class.oid = idx.indexrelid
    JOIN pg_am method ON method.oid = index_class.relam
    WHERE idx.indexrelid = v_usable_index
      AND idx.indrelid = 'public.piece_events'::regclass
      AND idx.indisvalid AND idx.indisready AND idx.indislive
      AND method.amname = 'btree'
      AND idx.indnkeyatts = 2 AND idx.indnatts = 2
      AND idx.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = idx.indrelid AND attname = 'piece_id')
      AND idx.indkey[1] = (SELECT attnum FROM pg_attribute WHERE attrelid = idx.indrelid AND attname = 'created_at')
      AND idx.indoption[0] = 0 AND idx.indoption[1] = 3
      AND idx.indpred IS NULL AND idx.indexprs IS NULL
  ) THEN
    RAISE EXCEPTION 'No usable piece_events (piece_id, created_at DESC) index; refusing index cleanup';
  END IF;

  -- Production may already retain only the legacy name. Never drop its sole
  -- usable piece-history index merely to standardize an index name.
  IF v_redundant_index IS NOT NULL AND v_retained_index IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM pg_index redundant
      JOIN pg_index retained
        ON retained.indrelid = redundant.indrelid
       AND retained.indnkeyatts = redundant.indnkeyatts
       AND retained.indnatts = redundant.indnatts
       AND retained.indkey = redundant.indkey
       AND retained.indclass = redundant.indclass
       AND retained.indcollation = redundant.indcollation
       AND retained.indoption = redundant.indoption
       AND retained.indpred IS NOT DISTINCT FROM redundant.indpred
       AND retained.indexprs IS NOT DISTINCT FROM redundant.indexprs
       AND retained.indisunique = redundant.indisunique
       AND retained.indnullsnotdistinct = redundant.indnullsnotdistinct
       AND retained.indisexclusion = redundant.indisexclusion
       AND retained.indisvalid AND retained.indisready AND retained.indislive
       AND retained.indexrelid = v_retained_index
      JOIN pg_class redundant_class ON redundant_class.oid = redundant.indexrelid
      JOIN pg_class retained_class ON retained_class.oid = retained.indexrelid
        AND retained_class.relam = redundant_class.relam
      WHERE redundant.indexrelid = v_redundant_index
        AND redundant.indisvalid AND redundant.indisready AND redundant.indislive
        AND NOT redundant.indisreplident AND NOT redundant.indisclustered
    )
    INTO v_redundant_index_matches;

    IF NOT v_redundant_index_matches THEN
      RAISE EXCEPTION 'idx_piece_events_piece no longer matches piece_events_piece_created_at_idx; refusing to remove it';
    END IF;
    DROP INDEX IF EXISTS public.idx_piece_events_piece;
  END IF;
END
$$;
