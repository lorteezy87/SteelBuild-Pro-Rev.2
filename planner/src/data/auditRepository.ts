import { supabase } from "@/lib/supabase";
import type { Database } from "@/types/supabase";

type PlannerAuditEventRow = Database["public"]["Tables"]["planner_action_events"]["Row"];

const AUDIT_EVENT_FIELDS = [
  "id",
  "project_id",
  "entity_type",
  "entity_id",
  "event_type",
  "before_state",
  "after_state",
  "actor_user_id",
  "occurred_at",
] as const satisfies readonly (keyof PlannerAuditEventRow)[];

const AUDIT_EVENT_COLUMNS = AUDIT_EVENT_FIELDS.join(",");
export type PlannerAuditEvent = Pick<PlannerAuditEventRow, (typeof AUDIT_EVENT_FIELDS)[number]>;

export async function listPlannerAuditEvents(projectId: string): Promise<PlannerAuditEvent[]> {
  if (!projectId.trim()) throw new Error("projectId is required.");

  const { data, error } = await supabase
    .from("planner_action_events")
    .select(AUDIT_EVENT_COLUMNS)
    .eq("project_id", projectId)
    .order("occurred_at", { ascending: false })
    .limit(200)
    .returns<PlannerAuditEvent[]>();

  if (error) throw error;
  return data ?? [];
}
