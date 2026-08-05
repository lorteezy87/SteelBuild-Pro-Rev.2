/**
 * g702.ts — the G702/G703 computation engine. Pure; all currency math goes
 * through src/lib/money.ts (integer cents) so the certificate reconciles to the
 * penny. Mirrors the AIA forms:
 *
 *   G703 line (per SOV item):
 *     C  scheduled_value
 *     D  work_completed_previous   (prior apps, cumulative, excl. stored)
 *     E  work_completed_this_period
 *     F  materials_stored
 *     G  total completed & stored  = D + E + F
 *     %  = G / C
 *     H  balance to finish         = C − G
 *     I  retainage                 = retainage% × G
 *
 *   G702 header:
 *     1 original_contract_sum
 *     2 net_change_orders
 *     3 contract sum to date       = 1 + 2
 *     4 total completed & stored   = Σ G
 *     5 total retainage            = Σ I
 *     6 total earned less retainage= 4 − 5
 *     7 less previous certificates
 *     8 current payment due        = 6 − 7
 *     9 balance to finish incl. retainage = 3 − 6
 */
import { addMoney, clampPercent, pctOf, percentComplete, subMoney, sumMoney } from "@/lib/money";
import type { ContractContext, PayApplicationLine } from "./types";

export interface LineFigures {
  /** Column G — total completed & stored to date. */
  totalCompletedStored: number;
  /** Column H — balance to finish. */
  balanceToFinish: number;
  /** Displayed % (G/C), incl. stored. */
  displayPercent: number;
}

/** Derived G703 figures for a line. */
export function lineFigures(line: Pick<PayApplicationLine, "scheduled_value" | "work_completed_previous" | "work_completed_this_period" | "materials_stored">): LineFigures {
  const workCompleted = addMoney(line.work_completed_previous, line.work_completed_this_period); // D + E
  const totalCompletedStored = addMoney(workCompleted, line.materials_stored); // G
  return {
    totalCompletedStored,
    balanceToFinish: subMoney(line.scheduled_value, totalCompletedStored), // H
    displayPercent: percentComplete(totalCompletedStored, line.scheduled_value), // G/C
  };
}

/** Retainage on a line = retainage% × (completed + stored). */
export function lineRetainage(line: Pick<PayApplicationLine, "scheduled_value" | "work_completed_previous" | "work_completed_this_period" | "materials_stored">, retainagePercent: number): number {
  return pctOf(lineFigures(line).totalCompletedStored, retainagePercent);
}

export interface G702Figures {
  originalContractSum: number;
  netChangeOrders: number;
  contractSumToDate: number;
  totalCompletedStored: number;
  totalRetainage: number;
  totalEarnedLessRetainage: number;
  lessPreviousCertificates: number;
  currentPaymentDue: number;
  balanceToFinish: number;
}

/** Compute the G702 header figures from the lines + contract context. */
export function computeG702(args: {
  contract: ContractContext;
  lines: PayApplicationLine[];
  lessPreviousCertificates: number;
}): G702Figures {
  const { contract, lines, lessPreviousCertificates } = args;
  const contractSumToDate = addMoney(contract.originalContractSum, contract.netChangeOrders);
  const totalCompletedStored = sumMoney((lines || []).map((l) => lineFigures(l).totalCompletedStored));
  const totalRetainage = sumMoney((lines || []).map((l) => l.retainage));
  const totalEarnedLessRetainage = subMoney(totalCompletedStored, totalRetainage);
  return {
    originalContractSum: contract.originalContractSum,
    netChangeOrders: contract.netChangeOrders,
    contractSumToDate,
    totalCompletedStored,
    totalRetainage,
    totalEarnedLessRetainage,
    lessPreviousCertificates,
    currentPaymentDue: subMoney(totalEarnedLessRetainage, lessPreviousCertificates),
    balanceToFinish: subMoney(contractSumToDate, totalEarnedLessRetainage),
  };
}

interface SovLineLike {
  id?: string;
  line_item_number?: string | null;
  description?: string | null;
  scheduled_value?: number | string | null;
}

/**
 * Draft the G703 lines for a NEW application: one per SOV item, carrying each
 * line's cumulative completed (D+E) and stored forward from the prior app as
 * this app's "previous". The user then enters this period's % + stored.
 */
export function buildLinesFromSov(args: {
  sovItems: SovLineLike[];
  priorLines?: PayApplicationLine[];
  retainagePercent?: number;
}): PayApplicationLine[] {
  const { sovItems, priorLines = [], retainagePercent = 0 } = args;
  const priorBySov = new Map<string, PayApplicationLine>();
  const priorByNum = new Map<string, PayApplicationLine>();
  for (const p of priorLines) {
    if (p.sov_item_id) priorBySov.set(p.sov_item_id, p);
    if (p.line_item_number) priorByNum.set(String(p.line_item_number), p);
  }
  return (sovItems || []).map((sov, i) => {
    const prior = (sov.id && priorBySov.get(sov.id)) || (sov.line_item_number && priorByNum.get(String(sov.line_item_number))) || null;
    const work_completed_previous = prior ? addMoney(prior.work_completed_previous, prior.work_completed_this_period) : 0;
    const materials_stored = prior ? Number(prior.materials_stored) || 0 : 0;
    const scheduled_value = Number(sov.scheduled_value) || 0;
    const line: PayApplicationLine = {
      sov_item_id: sov.id ?? null,
      line_item_number: sov.line_item_number || String(i + 1),
      description: sov.description || "",
      scheduled_value,
      work_completed_previous,
      work_completed_this_period: 0,
      materials_stored,
      percent_complete: percentComplete(work_completed_previous, scheduled_value),
      retainage: 0,
      sort_order: i,
    };
    line.retainage = lineRetainage(line, retainagePercent);
    return line;
  });
}

/**
 * Apply a user edit to a line — they enter the TOTAL % complete of the work
 * (and optionally stored materials). We back out this period's work (E = total
 * earned − previous) and re-withhold retainage. Returns a NEW line.
 */
export function applyLineProgress(
  line: PayApplicationLine,
  edit: { percentComplete?: number; materialsStored?: number },
  retainagePercent: number,
): PayApplicationLine {
  const pct = clampPercent(edit.percentComplete ?? line.percent_complete);
  const totalWorkEarned = pctOf(line.scheduled_value, pct); // D + E target
  const next: PayApplicationLine = {
    ...line,
    percent_complete: pct,
    work_completed_this_period: subMoney(totalWorkEarned, line.work_completed_previous),
    materials_stored: edit.materialsStored ?? line.materials_stored,
  };
  next.retainage = lineRetainage(next, retainagePercent);
  return next;
}
