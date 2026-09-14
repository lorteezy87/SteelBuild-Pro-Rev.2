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

/**
 * Backcharge numbers are contractual identifiers minted by create_backcharge()
 * inside the inserting transaction, and trg_enforce_backcharge_guards rejects a
 * direct write with "Use create_backcharge() — numbers are minted there". The
 * guard tests a transaction-local GUC only the RPC sets, so the plain
 * .insert() this used to do could never succeed.
 *
 * The RPC forces status 'draft' and mints the number; it does not cover
 * notice_date or attachments, which the form does collect, so those are written
 * straight after. The guard gates INSERT, not this UPDATE. Status, approval and
 * collection stamps are deliberately NOT carried — they move only through the
 * lifecycle RPCs.
 *
 * It also writes its own 'created' event via log_backcharge_event(), so the
 * client-side "created" entry that used to live here is gone; keeping it would
 * double every backcharge's first audit row.
 */
const BC_RPC_DERIVED = ["backcharge_number", "status", "ticket_total"] as const;
const BC_RPC_CARRIED = ["notice_date", "attachments"] as const;

export async function createBackcharge(input: Partial<Backcharge>): Promise<Backcharge> {
  const payload: Record<string, unknown> = { ...input };
  const projectId = payload.project_id;
  if (typeof projectId !== "string" || projectId === "") {
    throw new Error("project_id is required to create a backcharge");
  }
  delete payload.project_id;
  for (const column of BC_RPC_DERIVED) delete payload[column];

  const carried: Record<string, unknown> = {};
  for (const column of BC_RPC_CARRIED) {
    if (column in payload) carried[column] = payload[column];
  }

  const { data, error } = await supabase.rpc("create_backcharge", {
    p_project_id: projectId,
    p_payload: payload as never,
  });
  if (error) throw error;
  let bc = data as unknown as Backcharge;

  if (Object.keys(carried).length > 0) {
    const { data: patched, error: patchError } = await from("backcharges")
      .update(carried)
      .eq("id", bc.id)
      .select()
      .single();
    if (patchError) throw patchError;
    bc = patched as Backcharge;
  }

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
