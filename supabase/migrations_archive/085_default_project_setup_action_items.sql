-- 085_default_project_setup_action_items.sql
--
-- Creates 10 default "SETUP" action items for every project so teams
-- have a standardised setup checklist. Items are seeded:
--   1. Via a trigger on INSERT into projects (new projects)
--   2. Via a one-time backfill for existing projects
--
-- The trigger checks for existing SETUP items to avoid duplicates if
-- the function is ever called twice.

-- ─── 1. Helper function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.seed_default_setup_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _titles TEXT[] := ARRAY[
    'Project Info',
    'Drawings/Submittals/Revisions',
    'Work Packages',
    'RFIs',
    'Budgeted Labor Hours',
    'Project Scope',
    'Change Orders',
    'Resources',
    'Schedules',
    'SOVs/Budget/Expenses'
  ];
  _descriptions TEXT[] := ARRAY[
    'Verify all project info fields are complete: project number, client, GC, EOR, PM, super, contract value, dates, and address.',
    'Set up initial drawing sets, submittal packages, and revision tracking. Confirm approval routing is configured.',
    'Define work packages with scope, tonnage, crew assignments, and shop/field hour budgets.',
    'Initialize the RFI log. Confirm routing rules and response deadlines are set.',
    'Enter budgeted labor hours by work package and phase. Set baseline for tracking.',
    'Document the contracted scope of work. Attach the executed contract and scope exhibits.',
    'Review contract for change order procedures. Set up CO log with baseline scope reference.',
    'Assign project team members, equipment, and subcontractor contacts.',
    'Build the project schedule with milestones, predecessor logic, and phase dates.',
    'Set up the Schedule of Values, project budget, and expense tracking categories.'
  ];
  _title TEXT;
  _idx INT;
BEGIN
  -- Only seed if this project has no SETUP items yet
  IF EXISTS (
    SELECT 1 FROM public.action_items
    WHERE project_id = NEW.id AND category = 'SETUP'
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  FOR _idx IN 1 .. array_length(_titles, 1) LOOP
    INSERT INTO public.action_items (
      project_id, project_name, title, description,
      priority, status, category, metadata
    ) VALUES (
      NEW.id,
      COALESCE(NEW.name, ''),
      _titles[_idx],
      _descriptions[_idx],
      'Medium',
      'Open',
      'SETUP',
      jsonb_build_object('setup_item', true, 'sort_order', _idx)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- ─── 2. Trigger on new project creation ────────────────────────────
DROP TRIGGER IF EXISTS trg_seed_setup_items ON public.projects;
CREATE TRIGGER trg_seed_setup_items
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_default_setup_items();

-- ─── 3. Backfill existing projects ─────────────────────────────────
DO $$
DECLARE
  _proj RECORD;
  _titles TEXT[] := ARRAY[
    'Project Info',
    'Drawings/Submittals/Revisions',
    'Work Packages',
    'RFIs',
    'Budgeted Labor Hours',
    'Project Scope',
    'Change Orders',
    'Resources',
    'Schedules',
    'SOVs/Budget/Expenses'
  ];
  _descriptions TEXT[] := ARRAY[
    'Verify all project info fields are complete: project number, client, GC, EOR, PM, super, contract value, dates, and address.',
    'Set up initial drawing sets, submittal packages, and revision tracking. Confirm approval routing is configured.',
    'Define work packages with scope, tonnage, crew assignments, and shop/field hour budgets.',
    'Initialize the RFI log. Confirm routing rules and response deadlines are set.',
    'Enter budgeted labor hours by work package and phase. Set baseline for tracking.',
    'Document the contracted scope of work. Attach the executed contract and scope exhibits.',
    'Review contract for change order procedures. Set up CO log with baseline scope reference.',
    'Assign project team members, equipment, and subcontractor contacts.',
    'Build the project schedule with milestones, predecessor logic, and phase dates.',
    'Set up the Schedule of Values, project budget, and expense tracking categories.'
  ];
  _idx INT;
BEGIN
  FOR _proj IN
    SELECT id, name FROM public.projects
    WHERE is_deleted = false
      AND id NOT IN (
        SELECT DISTINCT project_id FROM public.action_items
        WHERE category = 'SETUP' AND project_id IS NOT NULL
      )
  LOOP
    FOR _idx IN 1 .. array_length(_titles, 1) LOOP
      INSERT INTO public.action_items (
        project_id, project_name, title, description,
        priority, status, category, metadata
      ) VALUES (
        _proj.id,
        COALESCE(_proj.name, ''),
        _titles[_idx],
        _descriptions[_idx],
        'Medium',
        'Open',
        'SETUP',
        jsonb_build_object('setup_item', true, 'sort_order', _idx)
      );
    END LOOP;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
