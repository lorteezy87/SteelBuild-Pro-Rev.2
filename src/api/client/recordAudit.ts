/**
 * recordAudit.ts — read-only access to the server row-change audit.
 *
 * `audit_log_trigger()` (SECURITY DEFINER) writes a before/after row image to
 * the `pma_audit_logs` table for every change to submittals, drawings,
 * drawing_sets, drawing_revisions and rfis. Despite the legacy table name it
 * is the database's generic audit sink, not part of the retired Project
 * Management Assistant — so it is deliberately NOT registered as an entity
 * client (src/__tests__/pmaRemoval.test.ts keeps the retired assistant's
 * identifiers out of entities.ts). Project-scoped SELECT is allowed by the
 * table's `project_select` policy; this module never writes.
 */
import { supabase } from "@/lib/supabase";
import type { AuditRow } from "@/lib/recordMovement";

const AUDIT_TABLE = "pma_audit_logs" as const;

export type AuditedTable = "submittals" | "drawing_sets" | "drawings" | "drawing_revisions" | "rfis";

export async function fetchRecordAudit(args: {
  projectId: string;
  table: AuditedTable;
  recordId: string;
  limit?: number;
  offset?: number;
}): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from(AUDIT_TABLE)
    .select("id, created_at, action, changed_by, old_values, new_values")
    .eq("project_id", args.projectId)
    .eq("entity_type", args.table)
    .eq("entity_id", args.recordId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(args.offset ?? 0, (args.offset ?? 0) + (args.limit ?? 40) - 1);
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}
