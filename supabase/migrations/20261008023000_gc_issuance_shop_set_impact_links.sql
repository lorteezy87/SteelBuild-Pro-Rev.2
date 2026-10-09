-- An explicit, reviewed relationship from a GC issuance to OUR shop drawing
-- sets. A matching sheet number is never a relationship or a fab release.
-- Candidate only: apply and hand-stamp the exact reviewed file under CLAUDE.md.
--
-- Composite foreign keys make cross-project references impossible even for a
-- service-role writer. The two redundant unique indexes are FK prerequisites.
-- Their creation takes a brief write-blocking lock on the parent tables in a
-- transactional migration; rehearse that lock duration on staging first.
CREATE UNIQUE INDEX IF NOT EXISTS gc_drawing_sets_project_id_id_key
  ON public.gc_drawing_sets (project_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS drawing_sets_project_id_id_key
  ON public.drawing_sets (project_id, id);

CREATE TABLE public.gc_issuance_shop_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gc_drawing_set_id uuid NOT NULL,
  drawing_set_id uuid NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gc_issuance_shop_sets_unique UNIQUE (gc_drawing_set_id, drawing_set_id),
  CONSTRAINT gc_issuance_shop_sets_gc_project_fkey
    FOREIGN KEY (project_id, gc_drawing_set_id)
    REFERENCES public.gc_drawing_sets (project_id, id) ON DELETE CASCADE,
  CONSTRAINT gc_issuance_shop_sets_shop_project_fkey
    FOREIGN KEY (project_id, drawing_set_id)
    REFERENCES public.drawing_sets (project_id, id) ON DELETE CASCADE
);

CREATE INDEX gc_issuance_shop_sets_project_gc_idx
  ON public.gc_issuance_shop_sets (project_id, gc_drawing_set_id);
CREATE INDEX gc_issuance_shop_sets_project_shop_idx
  ON public.gc_issuance_shop_sets (project_id, drawing_set_id);

COMMENT ON TABLE public.gc_issuance_shop_sets IS
  'PM-reviewed GC issuance impact mapping to shop drawing SET IDs. Advisory impact context only; never a submittal approval, sheet release or fabrication authorization.';

ALTER TABLE public.gc_issuance_shop_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY gc_issuance_shop_sets_read ON public.gc_issuance_shop_sets
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
REVOKE ALL ON TABLE public.gc_issuance_shop_sets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gc_issuance_shop_sets TO authenticated;
GRANT ALL ON TABLE public.gc_issuance_shop_sets TO service_role;

-- One audit row per changed assignment. This is not the retired PMA chat log.
CREATE TABLE public.gc_issuance_shop_set_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  gc_drawing_set_id uuid NOT NULL,
  before_set_ids uuid[] NOT NULL,
  after_set_ids uuid[] NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gc_issuance_shop_set_events_gc_project_fkey
    FOREIGN KEY (project_id, gc_drawing_set_id)
    REFERENCES public.gc_drawing_sets (project_id, id) ON DELETE CASCADE
);
CREATE INDEX gc_issuance_shop_set_events_project_gc_idx
  ON public.gc_issuance_shop_set_events (project_id, gc_drawing_set_id, changed_at DESC);
ALTER TABLE public.gc_issuance_shop_set_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY gc_issuance_shop_set_events_read ON public.gc_issuance_shop_set_events
  FOR SELECT TO authenticated
  USING (public.user_has_project_access(project_id));
REVOKE ALL ON TABLE public.gc_issuance_shop_set_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.gc_issuance_shop_set_events TO authenticated;
GRANT ALL ON TABLE public.gc_issuance_shop_set_events TO service_role;

-- A single transaction serializes replacement at the GC issuance row. Direct
-- browser DML has no grant. Existing links to subsequently archived shop sets
-- can be retained or explicitly removed, but an archived set cannot be added.
CREATE FUNCTION public.replace_gc_issuance_shop_set_links(
  p_project_id uuid,
  p_gc_drawing_set_id uuid,
  p_shop_set_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_before uuid[] := ARRAY[]::uuid[];
  v_after uuid[] := ARRAY[]::uuid[];
  v_added integer := 0;
  v_removed integer := 0;
  v_gc_impact text;
BEGIN
  IF v_actor IS NULL OR p_project_id IS NULL
     OR NOT public.user_has_project_role_at_least(p_project_id, 'pm') THEN
    RAISE EXCEPTION 'Not authorized to map GC issuance impact for this project'
      USING errcode = '42501';
  END IF;
  IF p_shop_set_ids IS NULL OR array_position(p_shop_set_ids, NULL) IS NOT NULL
     OR cardinality(p_shop_set_ids) <> (
       SELECT count(DISTINCT candidate.id)
       FROM unnest(p_shop_set_ids) AS candidate(id)
     ) THEN
    RAISE EXCEPTION 'Provide a distinct list of shop drawing set IDs'
      USING errcode = '22023';
  END IF;

  SELECT gc.steel_impact INTO v_gc_impact FROM public.gc_drawing_sets AS gc
    WHERE gc.id = p_gc_drawing_set_id
      AND gc.project_id = p_project_id
      AND gc.is_deleted = false AND gc.deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active GC issuance not found in this project'
      USING errcode = '22023';
  END IF;
  IF v_gc_impact = 'none' AND cardinality(p_shop_set_ids) > 0 THEN
    RAISE EXCEPTION 'Record the GC issuance as impacted or under review before linking affected shop sets'
      USING errcode = '23514';
  END IF;

  SELECT coalesce(array_agg(link.drawing_set_id ORDER BY link.drawing_set_id), ARRAY[]::uuid[])
    INTO v_before
    FROM public.gc_issuance_shop_sets AS link
    WHERE link.project_id = p_project_id
      AND link.gc_drawing_set_id = p_gc_drawing_set_id;

  IF EXISTS (
    SELECT 1 FROM unnest(p_shop_set_ids) AS requested(id)
    LEFT JOIN public.drawing_sets AS shop
      ON shop.id = requested.id AND shop.project_id = p_project_id
    WHERE shop.id IS NULL
      OR ((shop.is_deleted OR shop.deleted_at IS NOT NULL)
          AND NOT requested.id = ANY(v_before))
  ) THEN
    RAISE EXCEPTION 'A selected shop drawing set is not active in this project'
      USING errcode = '22023';
  END IF;

  DELETE FROM public.gc_issuance_shop_sets AS link
    WHERE link.project_id = p_project_id
      AND link.gc_drawing_set_id = p_gc_drawing_set_id
      AND NOT link.drawing_set_id = ANY(p_shop_set_ids);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO public.gc_issuance_shop_sets
    (project_id, gc_drawing_set_id, drawing_set_id, created_by)
  SELECT p_project_id, p_gc_drawing_set_id, requested.id, v_actor
    FROM unnest(p_shop_set_ids) AS requested(id)
    WHERE NOT requested.id = ANY(v_before);
  GET DIAGNOSTICS v_added = ROW_COUNT;

  SELECT coalesce(array_agg(link.drawing_set_id ORDER BY link.drawing_set_id), ARRAY[]::uuid[])
    INTO v_after
    FROM public.gc_issuance_shop_sets AS link
    WHERE link.project_id = p_project_id
      AND link.gc_drawing_set_id = p_gc_drawing_set_id;

  IF v_added > 0 OR v_removed > 0 THEN
    INSERT INTO public.gc_issuance_shop_set_events
      (project_id, gc_drawing_set_id, before_set_ids, after_set_ids, changed_by)
    VALUES (p_project_id, p_gc_drawing_set_id, v_before, v_after, v_actor);
  END IF;

  RETURN jsonb_build_object(
    'project_id', p_project_id,
    'gc_drawing_set_id', p_gc_drawing_set_id,
    'shop_set_ids', v_after,
    'added_count', v_added,
    'removed_count', v_removed,
    'unchanged', v_added = 0 AND v_removed = 0
  );
END;
$$;

-- The PM can still update the GC issuance through the existing RLS-protected
-- editor. Reject a contradictory "no steel impact" disposition if exact
-- affected-set links remain. Both this UPDATE and the replacement RPC take the
-- same GC row lock, so their checks serialize rather than racing.
CREATE FUNCTION public.prevent_gc_no_impact_with_shop_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.steel_impact = 'none'
     AND OLD.steel_impact IS DISTINCT FROM NEW.steel_impact
     AND EXISTS (
       SELECT 1 FROM public.gc_issuance_shop_sets AS link
       WHERE link.project_id = NEW.project_id
         AND link.gc_drawing_set_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Remove affected shop-set links before recording no steel impact'
      USING errcode = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER gc_no_impact_requires_no_shop_links
  BEFORE UPDATE OF steel_impact ON public.gc_drawing_sets
  FOR EACH ROW EXECUTE FUNCTION public.prevent_gc_no_impact_with_shop_links();
REVOKE ALL ON FUNCTION public.prevent_gc_no_impact_with_shop_links()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.replace_gc_issuance_shop_set_links(uuid, uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_gc_issuance_shop_set_links(uuid, uuid, uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_gc_issuance_shop_set_links(uuid, uuid, uuid[])
  TO service_role;

NOTIFY pgrst, 'reload schema';
