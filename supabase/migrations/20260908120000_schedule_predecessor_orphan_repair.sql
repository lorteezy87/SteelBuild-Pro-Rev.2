-- Schedule predecessor links — repair orphans left by deletes
-- (docs/audits/SCHEDULE_MODULE_AUDIT_2026-09-08.md §1.6).
--
-- `schedule_tasks.dependencies` is TEXT holding a JSON array of link objects
-- (`{id, type, lag_days}`). Because it is text and not a real foreign key,
-- Postgres cannot cascade a delete, and until this batch the delete mutations
-- removed the row and nothing else. 26 of 137 links in production (19%) pointed
-- at a task that no longer exists.
--
-- The orphan is invisible by design: `formatPredecessorLabels` skips links it
-- cannot resolve so the PRED column doesn't print "undefined", and the cascade's
-- `applyLink` skips an unresolvable predecessor. So the row looks correctly
-- sequenced while its constraint has silently stopped constraining — the
-- successor floats free and nothing on screen says so.
--
-- This repairs the existing rows once. `src/lib/schedule/predecessorCleanup.ts`
-- (wired into deleteTaskMut / bulkDeleteMut) stops new ones being created.
--
-- Element handling matches `parseDependencies` in src/services/scheduleCascade.ts
-- so the repair cannot disagree with the reader:
--   * object with a resolvable `id`   → kept, untouched
--   * legacy bare string that resolves → kept, untouched
--   * anything else (object without id, number, null, unresolvable id)
--                                     → dropped, exactly as the parser drops it
-- Surviving elements keep their original JSON verbatim, including type and lag.
-- The migration deliberately does NOT normalise legacy shapes: rewriting rows it
-- was not asked to touch would make the diff impossible to review against the
-- 26 rows this is supposed to fix.

BEGIN;

-- ─── 1) report what is about to change ───────────────────────────────────────

DO $$
DECLARE
  v_tasks   integer;
  v_links   integer;
BEGIN
  SELECT count(DISTINCT t.id), count(*)
    INTO v_tasks, v_links
  FROM public.schedule_tasks t
  CROSS JOIN LATERAL jsonb_array_elements(t.dependencies::jsonb) AS e(elem)
  WHERE t.dependencies IS NOT NULL
    AND pg_input_is_valid(t.dependencies, 'jsonb')
    AND jsonb_typeof(t.dependencies::jsonb) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_tasks s
      WHERE s.id::text = CASE jsonb_typeof(e.elem)
                           WHEN 'object' THEN e.elem ->> 'id'
                           WHEN 'string' THEN e.elem #>> '{}'
                           ELSE NULL
                         END
    );

  RAISE NOTICE 'schedule predecessor repair: clearing % orphaned link(s) across % task(s)',
    coalesce(v_links, 0), coalesce(v_tasks, 0);
END $$;

-- ─── 2) rebuild each affected row without its orphaned links ─────────────────

WITH candidates AS (
  SELECT id, dependencies::jsonb AS deps
  FROM public.schedule_tasks
  WHERE dependencies IS NOT NULL
    -- Guard the cast: one malformed row must not abort the whole repair.
    AND pg_input_is_valid(dependencies, 'jsonb')
    AND jsonb_typeof(dependencies::jsonb) = 'array'
    AND jsonb_array_length(dependencies::jsonb) > 0
),
exploded AS (
  SELECT
    c.id,
    e.ord,
    e.elem,
    CASE jsonb_typeof(e.elem)
      WHEN 'object' THEN e.elem ->> 'id'
      WHEN 'string' THEN e.elem #>> '{}'
      ELSE NULL
    END AS ref_id
  FROM candidates c
  CROSS JOIN LATERAL jsonb_array_elements(c.deps) WITH ORDINALITY AS e(elem, ord)
),
classified AS (
  SELECT
    x.id,
    x.ord,
    x.elem,
    (
      x.ref_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.schedule_tasks s WHERE s.id::text = x.ref_id)
    ) AS keep
  FROM exploded x
),
rebuilt AS (
  SELECT
    id,
    coalesce(jsonb_agg(elem ORDER BY ord) FILTER (WHERE keep), '[]'::jsonb) AS survivors
  FROM classified
  GROUP BY id
  -- Only rows that actually lose a link. Everything else keeps its bytes.
  HAVING count(*) FILTER (WHERE NOT keep) > 0
)
UPDATE public.schedule_tasks t
SET dependencies = CASE
      -- NULL, not '[]', so the column matches what serializeDependencies writes
      -- when the last link is removed.
      WHEN jsonb_array_length(r.survivors) = 0 THEN NULL
      ELSE r.survivors::text
    END
FROM rebuilt r
WHERE t.id = r.id;

-- ─── 3) prove it worked, in the same transaction ─────────────────────────────

DO $$
DECLARE
  v_remaining integer;
BEGIN
  SELECT count(*)
    INTO v_remaining
  FROM public.schedule_tasks t
  CROSS JOIN LATERAL jsonb_array_elements(t.dependencies::jsonb) AS e(elem)
  WHERE t.dependencies IS NOT NULL
    AND pg_input_is_valid(t.dependencies, 'jsonb')
    AND jsonb_typeof(t.dependencies::jsonb) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM public.schedule_tasks s
      WHERE s.id::text = CASE jsonb_typeof(e.elem)
                           WHEN 'object' THEN e.elem ->> 'id'
                           WHEN 'string' THEN e.elem #>> '{}'
                           ELSE NULL
                         END
    );

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'schedule predecessor repair left % orphaned link(s) behind', v_remaining;
  END IF;
  RAISE NOTICE 'schedule predecessor repair: 0 orphaned links remain';
END $$;

COMMENT ON COLUMN public.schedule_tasks.dependencies IS
  'JSON array of predecessor links: [{"id": uuid, "type": "FS|SS|FF|SF", "lag_days": int}]. TEXT, not a foreign key, so deletes cannot cascade — src/lib/schedule/predecessorCleanup.ts strips links to deleted tasks on the client. An orphaned link is silently ignored by both the PRED column and the cascade, so it reads as sequenced while constraining nothing.';

COMMIT;
