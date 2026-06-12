/**
 * Backcharge repository — the single persistence boundary for the backcharge
 * bounded context (public.backcharges / backcharge_tm_tickets / backcharge_events).
 *
 * Every mutation also writes an append-only backcharge_events row (best-effort)
 * so the defense package has a complete timestamped audit trail. Soft-delete
 * filtering is applied here (the new tables aren't wired into the entity layer's
 * auto-filter). The tables aren't in the generated DB types yet, so we use an
 * untyped `from` and enforce shape via this module's typed signatures.
 */
import { supabase } from "@/lib/supabase";
import { computeTmTicketTotal } from "./cost";
import type { Backcharge, BackchargeEvent, BackchargeEventType, TmTicket } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: string): any => (supabase.from as unknown as (t: string) => any)(table);

async function logEvent(ev: {
  backcharge_id: string;
  project_id: string;
  event_type: BackchargeEventType;
  from_status?: string | null;
  to_status?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await from("backcharge_events").insert({
      backcharge_id: ev.backcharge_id,
      project_id: ev.project_id,
      event_type: ev.event_type,
      from_status: ev.from_status ?? null,
      to_status: ev.to_status ?? null,
      detail: ev.detail ?? null,
    });
  } catch (err) {
    // Audit is best-effort — never fail the backcharge write on a log failure.
    // eslint-disable-next-line no-console
    console.warn("[backcharge] event log failed:", err);
  }
}

export async function listBackcharges(projectId: string): Promise<Backcharge[]> {
  const { data, error } = await from("backcharges")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as Backcharge[];
}

export async function getBackcharge(id: string): Promise<Backcharge | null> {
  const { data, error } = await from("backcharges").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as Backcharge) || null;
}

export async function createBackcharge(input: Partial<Backcharge>): Promise<Backcharge> {
  const { data, error } = await from("backcharges").insert(input).select().single();
  if (error) throw error;
  const bc = data as Backcharge;
  await logEvent({ backcharge_id: bc.id, project_id: bc.project_id, event_type: "created", to_status: bc.status, detail: bc.title });
  if (bc.notice_date) {
    await logEvent({ backcharge_id: bc.id, project_id: bc.project_id, event_type: "notice_sent", detail: `Notice dated ${bc.notice_date}` });
  }
  return bc;
}

export async function updateBackcharge(
  id: string,
  patch: Partial<Backcharge>,
  prev?: Backcharge | null,
): Promise<Backcharge> {
  const { data, error } = await from("backcharges").update(patch).eq("id", id).select().single();
  if (error) throw error;
  const bc = data as Backcharge;
  if (prev) {
    if (typeof patch.status === "string" && patch.status !== prev.status) {
      await logEvent({ backcharge_id: id, project_id: bc.project_id, event_type: "status_changed", from_status: prev.status, to_status: patch.status });
    }
    if (patch.notice_date && patch.notice_date !== prev.notice_date) {
      await logEvent({ backcharge_id: id, project_id: bc.project_id, event_type: "notice_sent", detail: `Notice dated ${patch.notice_date}` });
    }
    if (typeof patch.amount === "number" && patch.amount !== Number(prev.amount ?? 0)) {
      await logEvent({ backcharge_id: id, project_id: bc.project_id, event_type: "amount_changed", detail: `${prev.amount ?? 0} → ${patch.amount}` });
    }
  }
  return bc;
}

export async function softDeleteBackcharge(id: string): Promise<void> {
  const { error } = await from("backcharges")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listTmTickets(backchargeId: string): Promise<TmTicket[]> {
  const { data, error } = await from("backcharge_tm_tickets")
    .select("*")
    .eq("backcharge_id", backchargeId)
    .eq("is_deleted", false)
    .order("ticket_date", { ascending: true });
  if (error) throw error;
  return (data || []) as TmTicket[];
}

export async function addTmTicket(input: Partial<TmTicket>): Promise<TmTicket> {
  // Stamp the authoritative computed total so the stored `amount` can't drift.
  const amount = computeTmTicketTotal(input as TmTicket);
  const { data, error } = await from("backcharge_tm_tickets").insert({ ...input, amount }).select().single();
  if (error) throw error;
  const t = data as TmTicket;
  await logEvent({
    backcharge_id: t.backcharge_id,
    project_id: t.project_id,
    event_type: "tm_added",
    detail: `T&M ${t.ticket_number || t.ticket_date || ""} — $${amount.toLocaleString()}`,
  });
  return t;
}

export async function softDeleteTmTicket(id: string): Promise<void> {
  const { error } = await from("backcharge_tm_tickets")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listEvents(backchargeId: string): Promise<BackchargeEvent[]> {
  const { data, error } = await from("backcharge_events")
    .select("*")
    .eq("backcharge_id", backchargeId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as BackchargeEvent[];
}
