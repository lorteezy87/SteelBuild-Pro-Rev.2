-- user_projects has no updated_at column. The baseline trigger invokes the
-- generic updater during role changes and fails every UPDATE with 42703.
-- Keep the membership activity trigger intact; remove only the invalid
-- timestamp trigger.
DROP TRIGGER IF EXISTS trg_user_projects_updated_at ON public.user_projects;
