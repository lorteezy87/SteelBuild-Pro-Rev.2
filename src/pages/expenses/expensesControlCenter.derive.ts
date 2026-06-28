/**
 * Pure derivations for the Expenses Control Center (command_ui redesign).
 * No React, no network, no side effects.
 *
 * AMOUNT UNITS: expenses.amount is stored as **dollars** (not integer cents).
 * The integer-cents convention in money.ts applies to pay-app/SOV math.
 * We sum via sumMoney() to avoid float drift but the raw values are dollars.
 *
 * KPIs derived from real DB fields:
 *   amount          — dollar value of the expense (float dollars, may be null)
 *   payment_status  — "Paid" | "Unpaid" | "Pending Approval" | "Voided"
 *   expense_date    — ISO date string (YYYY-MM-DD)
 *   cost_code       — cost code string (e.g. "01-100")
 *   vendor          — vendor name string
 *   expense_type    — type string (e.g. "Material", "Labor", "Equipment")
 *   reimbursable    — MISSING from schema: not a column in the expenses table
 */

import { sumMoney } from "@/lib/money";
import type { PillTone } from "@/components/command";

// ── Schema shape (real columns only) ──────────────────────────────────────
export interface ExpenseRecord {
  id: string;
  amount?: number | null;
  payment_status?: string | null;
  expense_date?: string | null;
  expense_number?: string | null;
  description?: string | null;
  vendor?: string | null;
  cost_code?: string | null;
  cost_code_name?: string | null;
  expense_type?: string | null;
  work_package_id?: string | null;
  work_package_name?: string | null;
  submitted_by?: string | null;
  approved_by?: string | null;
  invoice_number?: string | null;
  notes?: string | null;
  project_id?: string;
  project_name?: string | null;
  [key: string]: unknown;
}

// ── Panel queue shapes ──────────────────────────────────────────────────
export interface CategoryRow {
  category: string;
  amount: number;
  count: number;
}

export interface VendorRow {
  vendor: string;
  amount: number;
  count: number;
}

export interface ApprovalRow {
  id: string;
  expense_number?: string | null;
  description?: string | null;
  vendor?: string | null;
  amount: number;
  expense_date?: string | null;
  payment_status?: string | null;
}

export interface ExpensesSummary {
  /** Total count of non-voided expenses. */
  totalCount: number;
  /** Sum of all non-voided expense amounts (dollars). */
  totalAmount: number;
  /** Sum of Paid expenses (dollars). */
  paidAmount: number;
  /** Count of Paid expenses. */
  paidCount: number;
  /** Sum of Unpaid + Pending Approval amounts (dollars). */
  outstandingAmount: number;
  /** Count of outstanding (unpaid + pending) expenses. */
  outstandingCount: number;
  /** Sum of expenses this calendar month (non-voided). */
  thisMonthAmount: number;
  /** Count of expenses this calendar month (non-voided). */
  thisMonthCount: number;
  /** Approval queue: Pending Approval status, sorted by date asc (oldest first). */
  approvalQueue: ApprovalRow[];
  /** Top 5 cost codes by spend, sorted desc. */
  byCategory: CategoryRow[];
  /** Top 5 vendors by spend, sorted desc. */
  byVendor: VendorRow[];
}

// ── Tone helpers ───────────────────────────────────────────────────────
export function expenseStatusTone(status?: string | null): PillTone {
  switch (status) {
    case "Paid": return "good";
    case "Pending Approval": return "warn";
    case "Unpaid": return "danger";
    case "Voided": return "neutral";
    default: return "neutral";
  }
}

// ── Date helpers ────────────────────────────────────────────────────────
function isThisMonth(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

// ── Main derivation ─────────────────────────────────────────────────────
export function buildExpensesSummary(rows: ExpenseRecord[]): ExpensesSummary {
  const active = rows.filter((e) => e.payment_status !== "Voided");

  const totalAmount = sumMoney(active.map((e) => e.amount));
  const paid = active.filter((e) => e.payment_status === "Paid");
  const paidAmount = sumMoney(paid.map((e) => e.amount));
  const outstanding = active.filter(
    (e) => e.payment_status === "Unpaid" || e.payment_status === "Pending Approval"
  );
  const outstandingAmount = sumMoney(outstanding.map((e) => e.amount));
  const thisMonth = active.filter((e) => isThisMonth(e.expense_date));
  const thisMonthAmount = sumMoney(thisMonth.map((e) => e.amount));

  // Approval queue: pending approval, oldest first
  const approvalQueue: ApprovalRow[] = active
    .filter((e) => e.payment_status === "Pending Approval")
    .map((e) => ({
      id: e.id,
      expense_number: e.expense_number,
      description: e.description,
      vendor: e.vendor,
      amount: Number(e.amount) || 0,
      expense_date: e.expense_date,
      payment_status: e.payment_status,
    }))
    .sort((a, b) => (a.expense_date || "").localeCompare(b.expense_date || ""))
    .slice(0, 6);

  // By cost_code category
  const catMap = new Map<string, { amount: number; count: number }>();
  for (const e of active) {
    const cat = e.cost_code_name || e.cost_code || "Uncategorized";
    const existing = catMap.get(cat);
    const amt = Number(e.amount) || 0;
    if (existing) {
      existing.amount += amt;
      existing.count++;
    } else {
      catMap.set(cat, { amount: amt, count: 1 });
    }
  }
  const byCategory: CategoryRow[] = [...catMap.entries()]
    .map(([category, d]) => ({ category, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // By vendor
  const vendorMap = new Map<string, { amount: number; count: number }>();
  for (const e of active) {
    const vendor = e.vendor?.trim() || "(No Vendor)";
    const existing = vendorMap.get(vendor);
    const amt = Number(e.amount) || 0;
    if (existing) {
      existing.amount += amt;
      existing.count++;
    } else {
      vendorMap.set(vendor, { amount: amt, count: 1 });
    }
  }
  const byVendor: VendorRow[] = [...vendorMap.entries()]
    .map(([vendor, d]) => ({ vendor, ...d }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  return {
    totalCount: active.length,
    totalAmount,
    paidAmount,
    paidCount: paid.length,
    outstandingAmount,
    outstandingCount: outstanding.length,
    thisMonthAmount,
    thisMonthCount: thisMonth.length,
    approvalQueue,
    byCategory,
    byVendor,
  };
}
