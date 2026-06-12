/**
 * Backcharge domain types (Phase 1 — Backcharge / CO Defense).
 *
 * The backcharge module is a self-contained bounded context with its own typed
 * repository (./repository.ts) over public.backcharges / backcharge_tm_tickets /
 * backcharge_events — so it doesn't depend on the generated DB types and can
 * evolve independently of the entity layer.
 */

export const BACKCHARGE_STATUSES = [
  "draft",
  "notice_sent",
  "pending",
  "disputed",
  "approved",
  "rejected",
  "collected",
  "void",
] as const;
export type BackchargeStatus = (typeof BACKCHARGE_STATUSES)[number];

export const BACKCHARGE_REASON_CODES = [
  "rework",
  "cleanup",
  "delay",
  "damage",
  "defective_material",
  "schedule",
  "other",
] as const;
export type BackchargeReasonCode = (typeof BACKCHARGE_REASON_CODES)[number];

export const RESPONSIBLE_PARTY_TYPES = [
  "subcontractor",
  "vendor",
  "supplier",
  "gc",
  "other",
] as const;
export type ResponsiblePartyType = (typeof RESPONSIBLE_PARTY_TYPES)[number];

/** Statuses where the backcharge is still being chased (vs. resolved). */
export const OPEN_BACKCHARGE_STATUSES = new Set<BackchargeStatus>([
  "draft",
  "notice_sent",
  "pending",
  "disputed",
]);

/** Human labels for the status enum (UI + export). */
export const BACKCHARGE_STATUS_LABELS: Record<BackchargeStatus, string> = {
  draft: "Draft",
  notice_sent: "Notice Sent",
  pending: "Pending",
  disputed: "Disputed",
  approved: "Approved",
  rejected: "Rejected",
  collected: "Collected",
  void: "Void",
};

export const BACKCHARGE_REASON_LABELS: Record<BackchargeReasonCode, string> = {
  rework: "Rework",
  cleanup: "Cleanup",
  delay: "Delay",
  damage: "Damage",
  defective_material: "Defective Material",
  schedule: "Schedule Impact",
  other: "Other",
};

export interface Backcharge {
  id: string;
  created_at?: string;
  updated_at?: string;
  project_id: string;
  backcharge_number?: string | null;
  title: string;
  description?: string | null;
  responsible_party?: string | null;
  responsible_party_type?: ResponsiblePartyType | null;
  reason_code?: BackchargeReasonCode | null;
  status: BackchargeStatus;
  amount?: number | null;
  incident_date?: string | null;
  notice_date?: string | null;
  linked_co_id?: string | null;
  source_rfi_id?: string | null;
  cost_code_id?: string | null;
  attachments?: unknown[] | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export interface TmTicket {
  id: string;
  created_at?: string;
  updated_at?: string;
  backcharge_id: string;
  project_id: string;
  ticket_number?: string | null;
  ticket_date?: string | null;
  description?: string | null;
  labor_hours?: number | null;
  labor_rate?: number | null;
  equipment_cost?: number | null;
  material_cost?: number | null;
  markup_percent?: number | null;
  amount?: number | null;
  signed_by?: string | null;
  attachments?: unknown[] | null;
  created_by?: string | null;
  is_deleted?: boolean | null;
  deleted_at?: string | null;
}

export type BackchargeEventType =
  | "created"
  | "status_changed"
  | "notice_sent"
  | "tm_added"
  | "amount_changed"
  | "note";

export interface BackchargeEvent {
  id: string;
  created_at?: string;
  backcharge_id: string;
  project_id: string;
  event_type: BackchargeEventType | string;
  from_status?: string | null;
  to_status?: string | null;
  detail?: string | null;
  actor?: string | null;
}
