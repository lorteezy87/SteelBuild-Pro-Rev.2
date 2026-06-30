/**
 * Pay-application repository — the persistence boundary for the G702/G703 ledger
 * (public.pay_applications / pay_application_lines). The G702/G703 math lives in
 * ./g702.ts; this module drafts a new application's lines from the SOV (carrying
 * the prior app's completed work forward), persists edits, and keeps the header
 * totals in sync. The tables aren't in the generated DB types, so we use an
 * untyped `from` and enforce shape via these typed signatures.
 */
import { supabase } from "@/lib/supabase";
import { applyLineProgress, buildLinesFromSov, computeG702 } from "./g702";
import type { ContractContext, PayApplication, PayApplicationLine } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: string): any => (supabase.from as unknown as (t: string) => any)(table);
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

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

export async function listLines(payApplicationId: string): Promise<PayApplicationLine[]> {
  const { data, error } = await from("pay_application_lines")
    .select("*").eq("pay_application_id", payApplicationId).order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as PayApplicationLine[];
}

interface SovLineLike { id?: string; line_item_number?: string | null; description?: string | null; scheduled_value?: number | string | null }

/**
 * Create the next pay application for a project: drafts G703 lines from the SOV,
 * carries the prior app's completed work forward, and seeds the G702 figures.
 */
export async function createPayApplication(
  input: { projectId: string; periodFrom?: string | null; periodTo?: string | null; retainagePercent: number; notes?: string | null },
  ctx: { sovItems: SovLineLike[]; contract: ContractContext },
): Promise<PayApplication> {
  const existing = await listPayApplications(input.projectId); // desc by app #
  // App numbers are never reused (continue past the highest existing, incl. void),
  // but the financial carry-forward basis must come from the last NON-VOID app: a
  // voided app certified nothing, so seeding G703 previous-work / G702 line 7 from
  // it would overstate the new certificate's "less previous certificates".
  const highest = existing[0] || null;
  const prior = existing.find((a) => a.status !== "void") || null;
  const applicationNumber = (highest?.application_number || 0) + 1;
  const priorLines = prior ? await listLines(prior.id) : [];
  // G702 line 7: cumulative earned-less-retainage certified through the prior app
  // (total completed & stored − retainage; the column isn't stored, so derive it).
  const lessPreviousCertificates = prior ? subPrior(prior) : 0;

  const draftLines = buildLinesFromSov({ sovItems: ctx.sovItems, priorLines, retainagePercent: input.retainagePercent });
  const g = computeG702({ contract: ctx.contract, lines: draftLines, lessPreviousCertificates });

  const { data: app, error } = await from("pay_applications").insert({
    project_id: input.projectId,
    application_number: applicationNumber,
    period_from: input.periodFrom ?? null,
    period_to: input.periodTo ?? null,
    retainage_percent: input.retainagePercent,
    original_contract_sum: ctx.contract.originalContractSum,
    net_change_orders: ctx.contract.netChangeOrders,
    total_completed_stored: g.totalCompletedStored,
    total_retainage: g.totalRetainage,
    less_previous_certificates: lessPreviousCertificates,
    current_payment_due: g.currentPaymentDue,
    notes: input.notes ?? null,
  }).select().single();
  if (error) throw error;

  if (draftLines.length) {
    const rows = draftLines.map((l) => ({
      pay_application_id: app.id,
      project_id: input.projectId,
      sov_item_id: l.sov_item_id ?? null,
      line_item_number: l.line_item_number ?? null,
      description: l.description ?? null,
      scheduled_value: l.scheduled_value,
      work_completed_previous: l.work_completed_previous,
      work_completed_this_period: l.work_completed_this_period,
      materials_stored: l.materials_stored,
      percent_complete: l.percent_complete,
      retainage: l.retainage,
      sort_order: l.sort_order ?? 0,
    }));
    const { error: lerr } = await from("pay_application_lines").insert(rows);
    if (lerr) throw lerr;
  }
  return app as PayApplication;
}

// Fallback if an older prior app didn't persist total_earned_less_retainage.
function subPrior(prior: PayApplication): number {
  return num(prior.total_completed_stored) - num(prior.total_retainage);
}

/** Recompute + persist the G702 header totals from the current lines. */
export async function recomputeTotals(payApplicationId: string): Promise<PayApplication> {
  const app = await getPayApplication(payApplicationId);
  if (!app) throw new Error("Pay application not found");
  const lines = await listLines(payApplicationId);
  const g = computeG702({
    contract: { originalContractSum: num(app.original_contract_sum), netChangeOrders: num(app.net_change_orders), retainagePercent: num(app.retainage_percent) },
    lines,
    lessPreviousCertificates: num(app.less_previous_certificates),
  });
  const { data, error } = await from("pay_applications").update({
    total_completed_stored: g.totalCompletedStored,
    total_retainage: g.totalRetainage,
    current_payment_due: g.currentPaymentDue,
  }).eq("id", payApplicationId).select().single();
  if (error) throw error;
  return data as PayApplication;
}

/** Apply a % / stored edit to a line, then resync the header. Returns the app. */
export async function updateLine(
  line: PayApplicationLine,
  edit: { percentComplete?: number; materialsStored?: number },
  retainagePercent: number,
): Promise<PayApplication> {
  const next = applyLineProgress(line, edit, retainagePercent);
  const { error } = await from("pay_application_lines").update({
    percent_complete: next.percent_complete,
    work_completed_this_period: next.work_completed_this_period,
    materials_stored: next.materials_stored,
    retainage: next.retainage,
  }).eq("id", line.id);
  if (error) throw error;
  return recomputeTotals(String(line.pay_application_id));
}

export async function updatePayApplication(id: string, patch: Partial<PayApplication>): Promise<PayApplication> {
  const { data, error } = await from("pay_applications").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data as PayApplication;
}

export async function softDeletePayApplication(id: string): Promise<void> {
  const { error } = await from("pay_applications").update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
