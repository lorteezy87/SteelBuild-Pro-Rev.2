/**
 * recordMovement.ts — "why did this record move?" from the server audit log.
 *
 * `audit_log_trigger()` writes a full before/after row image to
 * `pma_audit_logs` for every INSERT/UPDATE/DELETE on submittals, drawings,
 * drawing_sets, drawing_revisions and rfis. Unlike the client-written
 * `activities` feed, it cannot be skipped by a code path that forgets to call
 * logActivity, so it is the trustworthy source for the last workflow move.
 *
 * This module turns those row images into a short list of moves restricted to
 * the fields a PM cares about (status, ball in court, round, due date …).
 * Updates that touched only untracked columns (updated_at, counters) are
 * dropped so the panel never reports noise as a "move".
 *
 * Pure: no React, no Supabase.
 */

export interface AuditRow {
  id?: string | null;
  created_at?: string | null;
  action?: string | null;
  changed_by?: string | null;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
}

export interface TrackedField {
  key: string;
  label: string;
  /** A foreign-key column: report that it changed, never the raw id. */
  ref?: boolean;
}

export interface FieldChange {
  key: string;
  label: string;
  from: string | null;
  to: string | null;
  ref?: boolean;
}

export interface RecordMove {
  at: string | null;
  kind: "created" | "updated" | "deleted";
  changedBy: string | null;
  changes: FieldChange[];
}

/** Submittal fields that describe a workflow move. */
export const SUBMITTAL_TRACKED_FIELDS: readonly TrackedField[] = [
  { key: "status", label: "Status" },
  { key: "ball_in_court", label: "Ball in court" },
  { key: "round_number", label: "Round" },
  { key: "revision", label: "Revision" },
  { key: "reviewer", label: "Reviewer" },
  { key: "required_date", label: "Required" },
  { key: "submitted_date", label: "Sent" },
  { key: "returned_date", label: "Returned" },
  { key: "approval_chain_step", label: "Routing step" },
  { key: "fab_release_override_reason", label: "Release override" },
  { key: "is_deleted", label: "Deleted" },
];

/** Drawing-set fields that describe a workflow move. */
export const DRAWING_SET_TRACKED_FIELDS: readonly TrackedField[] = [
  { key: "detailing_state", label: "Detailing state" },
  { key: "status", label: "Status" },
  { key: "revision", label: "Revision" },
  { key: "current_submittal_id", label: "Governing submittal", ref: true },
  { key: "submittal_status", label: "Submittal status" },
  { key: "is_locked", label: "Locked" },
  { key: "locked_reason", label: "Lock reason" },
  { key: "is_deleted", label: "Deleted" },
];

function asText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function kindOf(action: string | null | undefined): RecordMove["kind"] | null {
  switch (String(action ?? "").toUpperCase()) {
    case "INSERT":
      return "created";
    case "UPDATE":
      return "updated";
    case "DELETE":
      return "deleted";
    default:
      return null;
  }
}

/**
 * Build the move list, newest first.
 *
 * @param rows   pma_audit_logs rows for ONE record (any order).
 * @param fields the tracked fields for that record type.
 * @param limit  maximum moves returned.
 */
export function buildRecordMoves(
  rows: readonly AuditRow[] | null | undefined,
  fields: readonly TrackedField[],
  limit = 5,
): RecordMove[] {
  const sorted = [...(rows ?? [])].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const out: RecordMove[] = [];
  for (const row of sorted) {
    const kind = kindOf(row.action);
    if (!kind) continue;
    const before = row.old_values ?? {};
    const after = row.new_values ?? {};
    const changes: FieldChange[] = [];
    for (const f of fields) {
      const from = kind === "created" ? null : asText(before[f.key]);
      const to = kind === "deleted" ? null : asText(after[f.key]);
      if (kind === "updated" && from === to) continue;
      if (kind === "created" && to === null) continue;
      if (kind === "deleted" && from === null) continue;
      changes.push({ key: f.key, label: f.label, from, to, ...(f.ref ? { ref: true } : {}) });
    }
    if (kind === "updated" && changes.length === 0) continue;
    out.push({ at: row.created_at ?? null, kind, changedBy: row.changed_by ?? null, changes });
    if (out.length >= limit) break;
  }
  return out;
}

/** One-line summary of a move, e.g. "Status Under Review → Revise and Resubmit". */
export function describeMove(move: RecordMove, maxChanges = 3): string {
  if (move.kind === "deleted") return "Record deleted";
  const parts = move.changes.slice(0, maxChanges).map((c) => {
    if (c.ref) return c.to ? `${c.label} ${c.from ? "changed" : "linked"}` : `${c.label} cleared`;
    return move.kind === "created" ? `${c.label} ${c.to ?? "—"}` : `${c.label} ${c.from ?? "—"} → ${c.to ?? "—"}`;
  });
  const more = move.changes.length - maxChanges;
  const body = parts.join(" · ") + (more > 0 ? ` · +${more} more` : "");
  return move.kind === "created" ? `Created · ${body}` : body;
}
