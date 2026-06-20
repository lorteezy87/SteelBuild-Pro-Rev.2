-- 20260620010000_payapp_line_immutability.sql
-- C2: a certified/submitted/paid pay application must be immutable. The G703
-- line figures (percent_complete, work_completed_this_period, materials_stored,
-- retainage) had no status lock anywhere — the UI inputs weren't disabled, the
-- repository's updateLine() rewrote current_payment_due with no audit row, and
-- the RLS UPDATE policy only checked role >= pm with no status predicate. So a
-- PM could silently rewrite the billed amount of an app already submitted to the
-- GC / paid. This trigger makes the DB the authoritative boundary (the UI lock +
-- audit are added alongside in PayApplications.jsx, but UI gates aren't enough).
--
-- Only a DRAFT pay app's lines may be inserted/updated. Creation is unaffected:
-- createPayApplication inserts the app first (status defaults to 'draft', NOT
-- NULL) and then its lines, so the parent is draft at line-insert time. Header
-- totals (recomputeTotals) update pay_applications, not lines, so the workflow
-- (draft -> submitted -> approved -> paid -> void) is untouched. To revise a
-- certified app, advance/void it via status rather than editing figures in place.
--
-- Applied live via Supabase MCP (apply_migration) 2026-06-20.

CREATE OR REPLACE FUNCTION public.enforce_payapp_line_draft_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_app_id uuid := COALESCE(NEW.pay_application_id, OLD.pay_application_id);
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.pay_applications WHERE id = v_app_id;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'Pay application is % - its G703 lines are locked (only a draft pay app can be edited; advance or void it via status instead).',
      COALESCE(v_status, 'missing')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_payapp_line_draft_only ON public.pay_application_lines;
CREATE TRIGGER trg_payapp_line_draft_only
  BEFORE INSERT OR UPDATE ON public.pay_application_lines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payapp_line_draft_only();
