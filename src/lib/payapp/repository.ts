/**
 * Pay-application repository — the persistence boundary for the G702/G703 ledger
 * (public.pay_applications / pay_application_lines). The G702/G703 math lives in
 * ./g702.ts; this module drafts a new application's lines from the SOV (carrying
 * the prior app's completed work forward), persists edits, and keeps the header
 * totals in sync. The tables aren't in the generated DB types, so we use an
 * untyped `from` and enforce shape via these typed signatures.
 *
 * Writes go through RPCs, not the tables. enforce_pay_application_guards
 * rejects a direct INSERT ("Use generate_pay_application() — application
 * numbers are minted there"), any status or stamp change ("Pay-application
 * status and stamps move only through move_pay_application()") and any typed
 * header total ("G702 totals are computed from the G703 lines, never typed").
 * Each guard tests a transaction-local steelbuild.payapp_rpc GUC that only the
 * RPCs set, so a PostgREST client can never satisfy it — creating or advancing
 * an application by writing the table failed with 42501 every time.
 */
import { supabase } from "@/lib/supabase";
import { applyLineProgress } from "./g702";
import type { PayApplication, PayApplicationLine } from "./types";

 
const from = (table: string): any => (supabase.from as unknown as (t: string) => any)(table);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Fresh project contract evidence, independent of the project switcher's local cache. */
export async function getPayAppContract(projectId: string): Promise<{ original_contract_value: number | null; retainage_percent: number | null }> {
  const { data, error } = await from("projects").select("original_contract_value, retainage_percent").eq("id", projectId).eq("is_deleted", false).single();
  if (error) throw error;
  if (!data) throw new Error("Current project contract is unavailable");
  return data;
}

export async function listPayApplications(projectId: string): Promise<PayApplication[]> {
  const { data, error } = await from("pay_applications")
    .select("*").eq("project_id", projectId).eq("is_deleted", false)
    .order("application_number", { ascending: false });
  if (error) throw error;
  return (data || []) as PayApplication[];
}

export async function getPayApplication(id: string): Promise<PayApplication | null> {
  const { data, error } = await from("pay_applications").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PayApplication) || null;
}

/** Read until an empty page, advancing by received rows (server caps may be lower). */
async function readAll<T>(page: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data) throw new Error("Pay application evidence was not returned");
    if (!data.length) return rows;
    rows.push(...data);
  }
}

export async function listLines(payApplicationId: string): Promise<PayApplicationLine[]> {
  return readAll<PayApplicationLine>((start, end) => from("pay_application_lines")
    .select("*").eq("pay_application_id", payApplicationId)
    .order("sort_order", { ascending: true }).order("id", { ascending: true }).range(start, end));
}

export interface SovLineLike { id: string; line_item_number?: string | null; description?: string | null; scheduled_value: number | string | null }
export async function listSovItems(projectId: string): Promise<SovLineLike[]> {
  return readAll<SovLineLike>((start, end) => from("sov_items")
    .select("id, line_item_number, description, scheduled_value").eq("project_id", projectId).eq("is_deleted", false)
    .order("line_item_number", { ascending: true }).order("id", { ascending: true }).range(start, end));
}

interface PayAppChangeOrder { id: string; status: string | null; co_amount: number | null }
export async function listPayAppChangeOrders(projectId: string): Promise<PayAppChangeOrder[]> {
  return readAll<PayAppChangeOrder>((start, end) => from("change_orders")
    .select("id, status, co_amount").eq("project_id", projectId).eq("is_deleted", false)
    .order("id", { ascending: true }).range(start, end));
}

/**
 * Create the next pay application for a project.
 *
 * generate_pay_application() does all of it in one transaction: mints the
 * number from get_next_sequence_number(project,'pay_application'), reads the
 * contract and retainage off the project, sums the live SOV, drafts the G703
 * lines via build_pay_application_lines(), then refreshes the G702 header with
 * refresh_pay_application_totals(). It also refuses a second open draft
 * ("Finish or void the open draft pay application first") and records whether
 * the SOV reconciles against contract + approved change orders.
 *
 * So the client no longer derives the application number (that was a
 * client-side mint, against the number-sequence rule), builds lines, or
 * computes header totals — the guard rejects typed totals outright.
 */
export async function createPayApplication(
  input: { projectId: string; periodFrom?: string | null; periodTo?: string | null; retainagePercent?: number; notes?: string | null },
): Promise<PayApplication> {
  const { data, error } = await supabase.rpc("generate_pay_application", {
    p_project_id: input.projectId,
    p_period_from: input.periodFrom ?? null,
    p_period_to: input.periodTo ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw error;
  const app = data as unknown as PayApplication;

  // The RPC seeds retainage from projects.retainage_percent. If the form asked
  // for a different rate, set it while the application is still draft (the
  // guard permits period and retainage edits only in draft) and re-touch the
  // lines: each line's retainage is computed by the BEFORE trigger from the
  // header rate, and that trigger only fires on a line write.
  const wanted = Number(input.retainagePercent);
  if (Number.isFinite(wanted) && num(app.retainage_percent) !== wanted) {
    const { error: rateError } = await from("pay_applications")
      .update({ retainage_percent: wanted })
      .eq("id", app.id);
    if (rateError) throw rateError;
    await retouchLines(app.id);
    return recomputeTotals(String(app.id));
  }
  return app;
}

/**
 * Fire compute_pay_application_line on every line without changing intent.
 *
 * Writing materials_stored back to itself is a no-op to the data and the whole
 * point: the BEFORE trigger recomputes total_completed_stored, percent_complete,
 * retainage and balance_to_finish from the header's retainage rate, and there is
 * no other way to ask it to run.
 */
async function retouchLines(payApplicationId: string): Promise<void> {
  const lines = await listLines(payApplicationId);
  for (const line of lines) {
    const { error } = await from("pay_application_lines")
      .update({ materials_stored: line.materials_stored ?? 0 })
      .eq("id", line.id);
    if (error) throw error;
  }
}

// Fallback if an older prior app didn't persist total_earned_less_retainage.
function subPrior(prior: PayApplication): number {
  return num(prior.total_completed_stored) - num(prior.total_retainage);
}

/**
 * Recompute + persist the G702 header totals from the current lines.
 *
 * refresh_pay_application_totals() is the only way: the guard rejects a typed
 * total_completed_stored / total_retainage / current_payment_due outright.
 */
export async function recomputeTotals(payApplicationId: string): Promise<PayApplication> {
  const { error } = await supabase.rpc("refresh_pay_application_totals", { p_id: payApplicationId });
  if (error) throw error;
  const app = await getPayApplication(payApplicationId);
  if (!app) throw new Error("Pay application not found");
  return app;
}

/** Apply a % / stored edit to a line, then resync the header. Returns the app. */
export async function updateLine(
  line: PayApplicationLine,
  edit: { percentComplete?: number; materialsStored?: number },
  retainagePercent: number,
): Promise<PayApplication> {
  const next = applyLineProgress(line, edit, retainagePercent);
  // Only the two columns a person actually enters. compute_pay_application_line
  // derives total_completed_stored, percent_complete, retainage and
  // balance_to_finish from these plus the header rate, and overwrites whatever
  // is sent for them — so sending a percent was at best ignored and at worst a
  // different number from the one the database then stored.
  const { error } = await from("pay_application_lines").update({
    work_completed_this_period: next.work_completed_this_period,
    materials_stored: next.materials_stored,
  }).eq("id", line.id);
  if (error) throw error;
  return recomputeTotals(String(line.pay_application_id));
}

/**
 * Columns the guard reserves for move_pay_application(): the status itself plus
 * every stamp that records who moved it and when.
 */
const MOVE_ONLY_COLUMNS = [
  "status",
  "submitted_date",
  "submitted_by",
  "certified_date",
  "approved_by",
  "paid_date",
  "void_reason",
] as const;

export async function updatePayApplication(id: string, patch: Partial<PayApplication>): Promise<PayApplication> {
  const moving = MOVE_ONLY_COLUMNS.some((column) => column in patch);
  if (moving) {
    // move_pay_application() validates the transition against
    // pay_application_transition_allowed, requires a written reason to void,
    // refuses to submit an application with no G703 lines, rolls the certified
    // percentages onto the SOV on approval (and marks it Paid on payment), and
    // re-refreshes every LATER draft application, whose "less previous
    // certificates" depends on this one. None of that is reproducible from a
    // table UPDATE, which is why the guard rejects one.
    const { data, error } = await supabase.rpc("move_pay_application", {
      p_id: id,
      p_status: String((patch as Record<string, unknown>).status ?? ""),
      p_notes: (patch.void_reason ?? patch.notes ?? null) as string | null,
      p_actor: null,
      p_date: null,
    });
    if (error) throw error;
    return data as unknown as PayApplication;
  }
  const { data, error } = await from("pay_applications").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as PayApplication;
}

export async function softDeletePayApplication(id: string): Promise<void> {
  const { error } = await from("pay_applications").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
