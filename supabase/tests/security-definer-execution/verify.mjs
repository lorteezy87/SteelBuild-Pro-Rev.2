import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL("../../migrations/20261013083754_revoke_bound_trigger_function_execute.sql", import.meta.url),
  "utf8",
);

const triggerFunctions = [
  "compute_expense_amount",
  "compute_pay_application_line",
  "compute_tm_ticket_amount",
  "enforce_action_item_guards",
  "enforce_assumption_guards",
  "enforce_backcharge_event_guards",
  "enforce_backcharge_guards",
  "enforce_billing_event_guards",
  "enforce_budget_hour_item_guards",
  "enforce_change_order_guards",
  "enforce_change_request_guards",
  "enforce_client_event_guards",
  "enforce_cost_row_guards",
  "enforce_data_erasure_log_guards",
  "enforce_decision_guards",
  "enforce_delivery_guards",
  "enforce_delivery_item_guards",
  "enforce_document_folder_guards",
  "enforce_document_guards",
  "enforce_expense_guards",
  "enforce_feature_flag_guards",
  "enforce_field_row_guards",
  "enforce_handoff_item_guards",
  "enforce_linked_folder_guards",
  "enforce_meeting_guards",
  "enforce_mitigation_guards",
  "enforce_model_element_guards",
  "enforce_model_registry_guards",
  "enforce_pay_application_guards",
  "enforce_pay_application_line_guards",
  "enforce_pma_audit_guards",
  "enforce_project_change_total_guard",
  "enforce_project_closeout_guards",
  "enforce_punchlist_close_guard",
  "enforce_quality_row_guards",
  "enforce_revision_comparison_guards",
  "enforce_revision_delta_guards",
  "enforce_revision_summary_guards",
  "enforce_risk_guards",
  "enforce_runtime_config_guards",
  "enforce_schedule_task_guards",
  "enforce_scope_item_guards",
  "enforce_task_dependency_guards",
  "enforce_tm_ticket_guards",
  "enforce_vendor_guards",
  "enforce_warranty_guards",
  "enforce_work_package_budget_line",
  "expenses_changed",
  "log_pma_change",
  "pay_application_lines_changed",
  "prepare_action_item_row",
  "prepare_document_row",
  "prepare_meeting_row",
  "prepare_risk_row",
  "prepare_scope_item_row",
  "roll_tm_tickets_into_backcharge",
  "sync_drawing_set_counts",
  "work_packages_soft_delete_unassign_pieces",
];

assert.equal(triggerFunctions.length, 58, "the reviewed production inventory must stay explicit");
const migrationFunctions = [...migration.matchAll(/'public\.([a-z0-9_]+)\(\)'/g)].map((match) => match[1]);
assert.deepEqual(
  migrationFunctions,
  triggerFunctions,
  "the migration must contain exactly the reviewed trigger-function inventory",
);

const db = new PGlite();

async function privilege(role, identity) {
  const { rows } = await db.query(
    "select has_function_privilege($1, $2, 'execute') as allowed",
    [role, identity],
  );
  return rows[0].allowed;
}

async function createTriggerFunction(name, bind = true) {
  await db.exec(`
    create function public.${name}() returns trigger
    language plpgsql security definer set search_path = ''
    as $$
    begin
      insert into public.trigger_hits(function_name) values ('${name}');
      return new;
    end
    $$;
    revoke all on function public.${name}() from public, anon, authenticated, service_role;
    grant execute on function public.${name}() to authenticated, service_role;
  `);
  if (bind) {
    await db.exec(`
      create trigger trg_${name}
      after insert on public.trigger_probe
      for each row execute function public.${name}();
    `);
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.trigger_probe(id bigint generated always as identity primary key);
    create table public.trigger_hits(function_name text not null);
    grant insert on public.trigger_probe to authenticated;

    create function public.reviewed_rpc() returns integer
    language sql security definer set search_path = '' as $$ select 1 $$;
    revoke all on function public.reviewed_rpc() from public, anon, authenticated, service_role;
    grant execute on function public.reviewed_rpc() to authenticated;
  `);

  for (const name of triggerFunctions) await createTriggerFunction(name);
  await createTriggerFunction("unreviewed_trigger_decoy");

  for (const name of triggerFunctions) {
    const identity = `public.${name}()`;
    assert.equal(await privilege("anon", identity), false, `${name}: anon starts denied`);
    assert.equal(await privilege("authenticated", identity), true, `${name}: fixture reproduces authenticated grant`);
    assert.equal(await privilege("service_role", identity), true, `${name}: fixture reproduces service-role grant`);
  }

  await db.exec(migration);

  for (const name of triggerFunctions) {
    const identity = `public.${name}()`;
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert.equal(await privilege(role, identity), false, `${name}: ${role} execution must be denied`);
    }
  }

  assert.equal(await privilege("authenticated", "public.reviewed_rpc()"), true, "reviewed RPC grants must not change");
  assert.equal(await privilege("authenticated", "public.unreviewed_trigger_decoy()"), true, "unreviewed trigger grants must not change");

  await db.exec("set role authenticated; insert into public.trigger_probe default values; reset role;");
  const hitCount = (await db.query("select count(*)::int as count from public.trigger_hits")).rows[0].count;
  assert.equal(hitCount, 59, "revoked EXECUTE grants must not stop bound triggers");

  await db.exec(migration);
  await db.exec("drop function public.compute_expense_amount() cascade");
  await db.exec(migration);

  console.log("PASS: 58 reviewed trigger-only functions denied to API roles; bindings still execute; RPC and decoy grants preserved; repeat/missing-object safe.");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.close();
}
