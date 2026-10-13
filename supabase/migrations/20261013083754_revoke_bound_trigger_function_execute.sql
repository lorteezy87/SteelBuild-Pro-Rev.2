-- Remove direct API-role execution from the 58 SECURITY DEFINER functions that
-- are invoked only as bound row triggers in SteelBuild production.
--
-- Trigger execution does not consult the invoking role's EXECUTE privilege on
-- the trigger function, so these revokes preserve writes while removing an
-- unnecessary privileged-function grant. Each named function is fail-closed:
-- an absent function is tolerated for repo/live drift, but a present function
-- must still return trigger and remain bound to at least one non-internal
-- trigger. The 102 authenticated SECURITY DEFINER RPCs are intentionally not
-- touched; their caller and row-authorization semantics require separate review.
--
-- This is source only. Apply and stamp through the reviewed-backend runbook;
-- never use db push, migration repair, or MCP apply_migration on the shared DB.

BEGIN;

DO $$
DECLARE
  v_identity text;
  v_oid regprocedure;
BEGIN
  FOREACH v_identity IN ARRAY ARRAY[
    'public.compute_expense_amount()',
    'public.compute_pay_application_line()',
    'public.compute_tm_ticket_amount()',
    'public.enforce_action_item_guards()',
    'public.enforce_assumption_guards()',
    'public.enforce_backcharge_event_guards()',
    'public.enforce_backcharge_guards()',
    'public.enforce_billing_event_guards()',
    'public.enforce_budget_hour_item_guards()',
    'public.enforce_change_order_guards()',
    'public.enforce_change_request_guards()',
    'public.enforce_client_event_guards()',
    'public.enforce_cost_row_guards()',
    'public.enforce_data_erasure_log_guards()',
    'public.enforce_decision_guards()',
    'public.enforce_delivery_guards()',
    'public.enforce_delivery_item_guards()',
    'public.enforce_document_folder_guards()',
    'public.enforce_document_guards()',
    'public.enforce_expense_guards()',
    'public.enforce_feature_flag_guards()',
    'public.enforce_field_row_guards()',
    'public.enforce_handoff_item_guards()',
    'public.enforce_linked_folder_guards()',
    'public.enforce_meeting_guards()',
    'public.enforce_mitigation_guards()',
    'public.enforce_model_element_guards()',
    'public.enforce_model_registry_guards()',
    'public.enforce_pay_application_guards()',
    'public.enforce_pay_application_line_guards()',
    'public.enforce_pma_audit_guards()',
    'public.enforce_project_change_total_guard()',
    'public.enforce_project_closeout_guards()',
    'public.enforce_punchlist_close_guard()',
    'public.enforce_quality_row_guards()',
    'public.enforce_revision_comparison_guards()',
    'public.enforce_revision_delta_guards()',
    'public.enforce_revision_summary_guards()',
    'public.enforce_risk_guards()',
    'public.enforce_runtime_config_guards()',
    'public.enforce_schedule_task_guards()',
    'public.enforce_scope_item_guards()',
    'public.enforce_task_dependency_guards()',
    'public.enforce_tm_ticket_guards()',
    'public.enforce_vendor_guards()',
    'public.enforce_warranty_guards()',
    'public.enforce_work_package_budget_line()',
    'public.expenses_changed()',
    'public.log_pma_change()',
    'public.pay_application_lines_changed()',
    'public.prepare_action_item_row()',
    'public.prepare_document_row()',
    'public.prepare_meeting_row()',
    'public.prepare_risk_row()',
    'public.prepare_scope_item_row()',
    'public.roll_tm_tickets_into_backcharge()',
    'public.sync_drawing_set_counts()',
    'public.work_packages_soft_delete_unassign_pieces()'
  ]
  LOOP
    v_oid := to_regprocedure(v_identity);

    IF v_oid IS NULL THEN
      RAISE NOTICE 'skip (absent, repo/live drift): revoke execute on %', v_identity;
      CONTINUE;
    END IF;

    IF pg_get_function_result(v_oid) <> 'trigger' THEN
      RAISE EXCEPTION 'refusing to alter %, expected trigger return type', v_identity;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgfoid = v_oid
        AND NOT tgisinternal
    ) THEN
      RAISE EXCEPTION 'refusing to alter %, function is no longer trigger-bound', v_identity;
    END IF;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_identity
    );
  END LOOP;
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
