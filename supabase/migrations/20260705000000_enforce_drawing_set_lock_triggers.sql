-- 20260705000000
--
-- Make drawing-set lock enforced in Postgres for the drawing-hub write path.
--
-- Scope:
-- - drawing-level writes that touch locked set rows:
--   drawing_zones, drawing_links, drawing_zone_dependencies, drawings
-- - insert / update / delete paths
-- - all roles (including service_role / direct DB clients)
--
-- Why: previous lock enforcement relied on client-side assertions for these
-- workflows; authenticated users with admin role (and service-role clients) could
-- still mutate through the existing policy surface. This migration adds trigger
-- guards that fail writes when the parent drawing_set is locked.

CREATE OR REPLACE FUNCTION public.raise_if_drawing_set_locked(p_set_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.drawing_sets ds
    WHERE ds.id = p_set_id
      AND COALESCE(ds.is_locked, false) = true
  ) THEN
    RAISE EXCEPTION 'DRAWING_SET_LOCKED: This drawing set is locked from edits. Unlock the set before making changes.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.guard_drawing_set_lock_for_drawings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_set_id uuid;
  v_old_set_id uuid;
  v_new_set_id uuid;
BEGIN
  v_old_set_id := OLD.drawing_set_id;
  v_new_set_id := NEW.drawing_set_id;

  IF TG_OP = 'INSERT' THEN
    IF v_new_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_new_set_id);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_old_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_old_set_id);
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: block if either prior or target set is locked.
  IF v_old_set_id IS NOT NULL THEN
    PERFORM public.raise_if_drawing_set_locked(v_old_set_id);
  END IF;

  IF v_new_set_id IS DISTINCT FROM v_old_set_id AND v_new_set_id IS NOT NULL THEN
    PERFORM public.raise_if_drawing_set_locked(v_new_set_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION public.guard_drawing_set_lock_for_drawing_zones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_set_id uuid;
  v_new_set_id uuid;
  v_old_set_id uuid;
BEGIN
  v_old_set_id := (
    SELECT d.drawing_set_id
    FROM public.drawings d
    WHERE d.id = OLD.drawing_id
    LIMIT 1
  );
  v_new_set_id := (
    SELECT d.drawing_set_id
    FROM public.drawings d
    WHERE d.id = NEW.drawing_id
    LIMIT 1
  );

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF v_new_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_new_set_id);
    END IF;
    IF TG_OP = 'UPDATE' AND v_old_set_id IS DISTINCT FROM v_new_set_id AND v_old_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_old_set_id);
    END IF;
  ELSE
    IF v_old_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_old_set_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION public.guard_drawing_set_lock_for_drawing_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_set_id uuid;
  v_new_set_id uuid;
  v_old_set_id uuid;
BEGIN
  v_old_set_id := (
    SELECT d.drawing_set_id
    FROM public.drawings d
    WHERE d.id = OLD.drawing_id
    LIMIT 1
  );
  v_new_set_id := (
    SELECT d.drawing_set_id
    FROM public.drawings d
    WHERE d.id = NEW.drawing_id
    LIMIT 1
  );

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF v_new_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_new_set_id);
    END IF;
    IF TG_OP = 'UPDATE' AND v_old_set_id IS DISTINCT FROM v_new_set_id AND v_old_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_old_set_id);
    END IF;
  ELSE
    IF v_old_set_id IS NOT NULL THEN
      PERFORM public.raise_if_drawing_set_locked(v_old_set_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION public.guard_drawing_set_lock_for_drawing_zone_dependencies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_source_zone_id uuid;
  v_old_source_zone_id uuid;
  v_new_source_zone_id uuid;
  v_target_zone_id uuid;
  v_old_target_zone_id uuid;
  v_new_target_zone_id uuid;
BEGIN
  v_old_source_zone_id := OLD.source_zone_id;
  v_new_source_zone_id := NEW.source_zone_id;
  v_old_target_zone_id := OLD.target_zone_id;
  v_new_target_zone_id := NEW.target_zone_id;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF v_new_source_zone_id IS NOT NULL THEN
      SELECT d.drawing_set_id
      INTO v_source_zone_id
      FROM public.drawing_zones z
      JOIN public.drawings d ON d.id = z.drawing_id
      WHERE z.id = v_new_source_zone_id
      LIMIT 1;
      IF v_source_zone_id IS NOT NULL THEN
        PERFORM public.raise_if_drawing_set_locked(v_source_zone_id);
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND v_old_source_zone_id IS DISTINCT FROM v_new_source_zone_id AND v_old_source_zone_id IS NOT NULL THEN
      SELECT d.drawing_set_id
      INTO v_source_zone_id
      FROM public.drawing_zones z
      JOIN public.drawings d ON d.id = z.drawing_id
      WHERE z.id = v_old_source_zone_id
      LIMIT 1;
      IF v_source_zone_id IS NOT NULL THEN
        PERFORM public.raise_if_drawing_set_locked(v_source_zone_id);
      END IF;
    END IF;

    IF v_new_target_zone_id IS NOT NULL THEN
      SELECT d.drawing_set_id
      INTO v_target_zone_id
      FROM public.drawing_zones z
      JOIN public.drawings d ON d.id = z.drawing_id
      WHERE z.id = v_new_target_zone_id
      LIMIT 1;
      IF v_target_zone_id IS NOT NULL THEN
        PERFORM public.raise_if_drawing_set_locked(v_target_zone_id);
      END IF;
    END IF;

    IF TG_OP = 'UPDATE' AND v_old_target_zone_id IS DISTINCT FROM v_new_target_zone_id AND v_old_target_zone_id IS NOT NULL THEN
      SELECT d.drawing_set_id
      INTO v_target_zone_id
      FROM public.drawing_zones z
      JOIN public.drawings d ON d.id = z.drawing_id
      WHERE z.id = v_old_target_zone_id
      LIMIT 1;
      IF v_target_zone_id IS NOT NULL THEN
        PERFORM public.raise_if_drawing_set_locked(v_target_zone_id);
      END IF;
    END IF;
  ELSE
    IF v_old_source_zone_id IS NOT NULL THEN
      SELECT d.drawing_set_id
      INTO v_source_zone_id
      FROM public.drawing_zones z
      JOIN public.drawings d ON d.id = z.drawing_id
      WHERE z.id = v_old_source_zone_id
      LIMIT 1;
      IF v_source_zone_id IS NOT NULL THEN
        PERFORM public.raise_if_drawing_set_locked(v_source_zone_id);
      END IF;
    END IF;

    IF v_old_target_zone_id IS NOT NULL THEN
      SELECT d.drawing_set_id
      INTO v_target_zone_id
      FROM public.drawing_zones z
      JOIN public.drawings d ON d.id = z.drawing_id
      WHERE z.id = v_old_target_zone_id
      LIMIT 1;
      IF v_target_zone_id IS NOT NULL THEN
        PERFORM public.raise_if_drawing_set_locked(v_target_zone_id);
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_drawings_set_lock_guard ON public.drawings;
CREATE TRIGGER trg_drawings_set_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.drawings
FOR EACH ROW EXECUTE FUNCTION public.guard_drawing_set_lock_for_drawings();

DROP TRIGGER IF EXISTS trg_drawing_zones_set_lock_guard ON public.drawing_zones;
CREATE TRIGGER trg_drawing_zones_set_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.drawing_zones
FOR EACH ROW EXECUTE FUNCTION public.guard_drawing_set_lock_for_drawing_zones();

DROP TRIGGER IF EXISTS trg_drawing_links_set_lock_guard ON public.drawing_links;
CREATE TRIGGER trg_drawing_links_set_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.drawing_links
FOR EACH ROW EXECUTE FUNCTION public.guard_drawing_set_lock_for_drawing_links();

DROP TRIGGER IF EXISTS trg_drawing_zone_dependencies_set_lock_guard ON public.drawing_zone_dependencies;
CREATE TRIGGER trg_drawing_zone_dependencies_set_lock_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.drawing_zone_dependencies
FOR EACH ROW EXECUTE FUNCTION public.guard_drawing_set_lock_for_drawing_zone_dependencies();

notify pgrst, 'reload schema';
