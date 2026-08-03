import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../20260802090500_planner_offline_idempotency.sql", import.meta.url), "utf8");

describe("planner offline idempotency migration", () => {
  it("uses a durable user-and-operation receipt instead of a mutable target marker", () => {
    expect(sql).toMatch(/create table if not exists public\.planner_offline_operation_receipts/i);
    expect(sql).toMatch(/primary key \(user_id, client_op_id\)/i);
    expect(sql).not.toMatch(/last_client_op_id/i);
  });

  it("keeps replay in a secured, strict project-scoped RPC", () => {
    expect(sql).toMatch(/function public\.apply_planner_offline_operation[\s\S]+security definer[\s\S]+set search_path = public, pg_temp/i);
    expect(sql).toMatch(/user_has_project_role_at_least\(p_project_id, 'field'\)/i);
    expect(sql).toMatch(/p_kind = 'action-status'/i);
    expect(sql).toMatch(/p_kind = 'schedule-progress'/i);
    expect(sql).toMatch(/from public\.planner_offline_operation_receipts/i);
    expect(sql).toMatch(/insert into public\.planner_offline_operation_receipts/i);
    expect(sql).toMatch(/stored_result/i);
    expect(sql).toMatch(/if not public\.user_has_project_role_at_least\(p_project_id, 'field'\)[\s\S]+select \* into v_receipt/i);
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]+p_client_op_id/i);
    expect(sql).toMatch(/updated_at = p_expected_updated_at/i);
    expect(sql).toMatch(/revoke all on function public\.apply_planner_offline_operation/i);
    expect(sql).toMatch(/grant execute on function public\.apply_planner_offline_operation[\s\S]+to authenticated/i);
  });

  it("keeps the action-status allow-list and schedule-progress payload bounds explicit", () => {
    expect(sql).toMatch(/p_patch->>'status' in \('Open', 'In Progress', 'Complete', 'Cancelled', 'Resolved', 'Closed'\)/i);
    expect(sql).toMatch(/jsonb_typeof\(p_patch->'percent_complete'\) <> 'number'/i);
    expect(sql).toMatch(/v_progress < 0 or v_progress > 100/i);
  });
});
