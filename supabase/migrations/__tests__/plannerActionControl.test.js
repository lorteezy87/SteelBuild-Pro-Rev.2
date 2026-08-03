import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../20260802090000_planner_action_control.sql", import.meta.url),
  "utf8",
);

describe("planner action control migration", () => {
  it("adds explicit control fields and immutable audit events", () => {
    for (const column of ["workstream", "action_date", "follow_up_date", "impact_date", "waiting_on", "assigned_user_id", "source_entity_type", "source_entity_id", "completed_at", "archived_at"]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${column}`, "i"));
    }
    expect(sql).toMatch(/create table if not exists public\.planner_action_events/i);
    expect(sql).toMatch(/user_has_project_role_at_least[\s\S]*'field'/i);
    expect(sql).toMatch(/revoke[\s\S]+update[\s\S]+planner_action_events/i);
    expect(sql).toMatch(/revoke[\s\S]+delete[\s\S]+planner_action_events/i);
  });

  it("keeps the action source catalog explicit and replay-safe", () => {
    expect(sql).toMatch(
      /action_items_source_entity_type_check[\s\S]+source_entity_type[\s\S]+in[\s\S]+['"]rfi['"][\s\S]+['"]submittal['"][\s\S]+['"]drawing_set['"][\s\S]+['"]change_order['"][\s\S]+['"]work_package['"][\s\S]+['"]delivery['"][\s\S]+['"]schedule_task['"][\s\S]+['"]meeting['"]/i,
    );
    expect(sql).toMatch(
      /if not exists[\s\S]+pg_constraint[\s\S]+action_items_source_entity_type_check/i,
    );
  });

  it("uses a secured, server-only event write path", () => {
    expect(sql).toMatch(
      /function public\.record_planner_action_event\(\)[\s\S]+security definer[\s\S]+set search_path = public, pg_temp/i,
    );
    expect(sql).toMatch(
      /user_has_project_role_at_least\(v_project_id, 'field'\)/i,
    );
    expect(sql).toMatch(
      /create policy planner_action_events_select[\s\S]+for select to authenticated[\s\S]+user_has_project_access\(project_id\)/i,
    );
    expect(sql).toMatch(
      /revoke insert, update, delete on table public\.planner_action_events from public, anon, authenticated, service_role/i,
    );
  });

  it("keeps replay and audit protections explicit", () => {
    expect(sql).toMatch(
      /drop policy if exists planner_action_events_select on public\.planner_action_events;\s*create policy planner_action_events_select/i,
    );
    expect(sql).toMatch(
      /create trigger record_planner_action_item_event[\s\S]+after insert or update on public\.action_items/i,
    );
    expect(sql).toMatch(
      /create trigger record_planner_schedule_task_event[\s\S]+after insert or update on public\.schedule_tasks/i,
    );
    expect(sql).toMatch(
      /create trigger guard_planner_action_event_mutation[\s\S]+before update or delete on public\.planner_action_events/i,
    );
  });
});
