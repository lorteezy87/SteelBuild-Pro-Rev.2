/**
 * Pure derivations for the SOV Control Center (command_ui redesign).
 * No React, no network calls, no side effects.
 *
 * MONEY UNITS: SOV stores float dollars (NOT cents). All arithmetic uses
 * roundCurrency (rounds to 2 decimal places) — the same approach as the
 * existing SOV page's calc() function to avoid IEEE 754 float drift.
 *
 * IMPORTANT: Do NOT import formatCurrency or formatPercent here — they
 * are React-runtime-safe but this module is intended to be pure TS so it
 * can run in test workers without DOM globals. Formatting stays in the
 * component layer.
 */

/** Minimal shape of one SOV line item (real DB columns). */
export interface SovLineItem {
  id?: string;
  sov_id?: string | null;
  line_item_number?: number | string | null;
  description?: string | null;
  scheduled_value?: number | string | null;
  previous_percent_complete?: number | string | null;
  current_percent_complete?: number | string | null;
  retainage_percent?: number | string | null;
  status?: string | null;
  application_number?: number | string | null;
  phase?: string | null;
  cost_code?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  [key: string]: unknown;
}

/** Per-row calculated financials. Mirrors SOV.jsx calc() exactly. */
export interface SovRowCalc {
  sv: number;
  thisPeriod: number;
  toDate: number;
  balance: number;
  retAmt: number;
  netToDate: number;
  retPct: number;
  overBilled: boolean;
}

/** Summary shape returned by buildSovSummary(). */
export interface SovSummary {
  /** KPI financials — raw dollars, format in the component */
  contractValue: number;
  billedToDate: number;
  thisPeriod: number;
  balanceToFinish: number;
  retainageHeld: number;
  netToDate: number;
  /** Weighted % complete across all items (by scheduled value) */
  pctComplete: number;
  /** Count of line items where current_percent_complete > 100 OR balance < 0 */
  overBilledCount: number;
  /** Count of items with status === "Submitted" — need PM attention */
  pendingApprovalCount: number;
  /** Count of items with status === "Draft" */
  draftCount: number;
  /** Billing progress panel: groups by application_number */
  billingProgress: BillingProgressRow[];
  /** Division/phase panel: groups by phase or cost_code */
  byDivision: DivisionRow[];
  /** Items needing attention: over-billed + submitted + not-started */
  attentionItems: SovLineItem[];
}

export interface BillingProgressRow {
  appNumber: string;
  itemCount: number;
  scheduled: number;
  toDate: number;
  pct: number;
}

export interface DivisionRow {
  label: string;
  itemCount: number;
  scheduled: number;
  toDate: number;
  balance: number;
}

/** Round to 2 decimal places — matches roundCurrency in formatters.jsx */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Per-row financial calculation. Mirrors SOV.jsx calc() exactly so
 * the redesigned page produces identical numbers to the classic one.
 * effectiveRetainage: null = use the per-row retainage_percent field.
 */
export function calcRow(
  item: SovLineItem,
  effectiveRetainage: number | null = null,
): SovRowCalc {
  const sv = roundCents(Number(item.scheduled_value) || 0);
  const prevPct = Number(item.previous_percent_complete) || 0;
  const curPct = Number(item.current_percent_complete) || 0;
  const retPct =
    effectiveRetainage != null
      ? effectiveRetainage
      : Number(item.retainage_percent) || 0;
  const thisPeriod = roundCents(sv * ((curPct - prevPct) / 100));
  const toDate = roundCents(sv * (curPct / 100));
  const balance = roundCents(sv - toDate);
  const retAmt = roundCents(toDate * (retPct / 100));
  const netToDate = roundCents(toDate - retAmt);
  const overBilled = curPct > 100 || balance < 0;
  return { sv, thisPeriod, toDate, balance, retAmt, netToDate, retPct, overBilled };
}

/** Division/phase label for a line item — matches SOV.jsx phaseGroups logic. */
function divisionLabel(item: SovLineItem): string {
  return (
    (item.phase as string | null) ||
    (item.cost_code as string | null) ||
    ((item.description as string | null) || "Ungrouped").split(/[\s-]/)[0] ||
    "Ungrouped"
  );
}

/** Weighted % complete: sum(toDate) / sum(scheduled_value) × 100. */
function weightedPct(totalToDate: number, totalScheduled: number): number {
  if (totalScheduled <= 0) return 0;
  return Math.round((totalToDate / totalScheduled) * 1000) / 10; // 1 decimal
}

/**
 * Build all KPIs + panel queues for the SOV Control Center.
 * effectiveRetainage: null = per-row retainage_percent field (default).
 */
export function buildSovSummary(
  lines: SovLineItem[],
  effectiveRetainage: number | null = null,
): SovSummary {
  // ── Totals pass ──────────────────────────────────────────────────
  let contractValue = 0;
  let billedToDate = 0;
  let thisPeriodTotal = 0;
  let balanceTotal = 0;
  let retainageTotal = 0;
  let netTotal = 0;
  let overBilledCount = 0;
  let pendingApprovalCount = 0;
  let draftCount = 0;

  for (const item of lines) {
    const c = calcRow(item, effectiveRetainage);
    contractValue = roundCents(contractValue + roundCents(Number(item.scheduled_value) || 0));
    billedToDate = roundCents(billedToDate + c.toDate);
    thisPeriodTotal = roundCents(thisPeriodTotal + c.thisPeriod);
    balanceTotal = roundCents(balanceTotal + c.balance);
    retainageTotal = roundCents(retainageTotal + c.retAmt);
    netTotal = roundCents(netTotal + c.netToDate);
    if (c.overBilled) overBilledCount++;
    if (item.status === "Submitted") pendingApprovalCount++;
    if (item.status === "Draft") draftCount++;
  }

  const pctComplete = weightedPct(billedToDate, contractValue);

  // ── Billing Progress panel — group by application_number ─────────
  const appBuckets = new Map<string, { scheduled: number; toDate: number; count: number }>();
  for (const item of lines) {
    const key = String(item.application_number ?? "No App #");
    const c = calcRow(item, effectiveRetainage);
    const existing = appBuckets.get(key);
    if (existing) {
      existing.scheduled = roundCents(existing.scheduled + roundCents(Number(item.scheduled_value) || 0));
      existing.toDate = roundCents(existing.toDate + c.toDate);
      existing.count++;
    } else {
      appBuckets.set(key, {
        scheduled: roundCents(Number(item.scheduled_value) || 0),
        toDate: c.toDate,
        count: 1,
      });
    }
  }
  const billingProgress: BillingProgressRow[] = Array.from(appBuckets.entries())
    .map(([appNumber, b]) => ({
      appNumber,
      itemCount: b.count,
      scheduled: b.scheduled,
      toDate: b.toDate,
      pct: weightedPct(b.toDate, b.scheduled),
    }))
    .sort((a, b) => {
      const na = Number(a.appNumber);
      const nb = Number(b.appNumber);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.appNumber.localeCompare(b.appNumber);
    });

  // ── By Division/Phase panel ───────────────────────────────────────
  const divBuckets = new Map<string, { scheduled: number; toDate: number; balance: number; count: number }>();
  for (const item of lines) {
    const key = divisionLabel(item);
    const c = calcRow(item, effectiveRetainage);
    const existing = divBuckets.get(key);
    if (existing) {
      existing.scheduled = roundCents(existing.scheduled + roundCents(Number(item.scheduled_value) || 0));
      existing.toDate = roundCents(existing.toDate + c.toDate);
      existing.balance = roundCents(existing.balance + c.balance);
      existing.count++;
    } else {
      divBuckets.set(key, {
        scheduled: roundCents(Number(item.scheduled_value) || 0),
        toDate: c.toDate,
        balance: c.balance,
        count: 1,
      });
    }
  }
  const byDivision: DivisionRow[] = Array.from(divBuckets.entries())
    .map(([label, b]) => ({
      label,
      itemCount: b.count,
      scheduled: b.scheduled,
      toDate: b.toDate,
      balance: b.balance,
    }))
    .sort((a, b) => b.scheduled - a.scheduled); // highest scheduled value first

  // ── Items Needing Attention ───────────────────────────────────────
  // Priority: over-billed first, then Submitted (awaiting approval), then 0% not started
  const overBilled = lines.filter((item) => calcRow(item, effectiveRetainage).overBilled);
  const submitted = lines.filter((item) => item.status === "Submitted" && !calcRow(item, effectiveRetainage).overBilled);
  const notStarted = lines.filter(
    (item) =>
      (Number(item.current_percent_complete) || 0) === 0 &&
      item.status !== "Paid" &&
      !calcRow(item, effectiveRetainage).overBilled,
  );
  // Limit: 3 over-billed + 3 submitted + 2 not-started, de-duped by id
  const seen = new Set<string>();
  const attentionItems: SovLineItem[] = [];
  for (const item of [...overBilled.slice(0, 3), ...submitted.slice(0, 3), ...notStarted.slice(0, 2)]) {
    if (item.id && seen.has(item.id)) continue;
    if (item.id) seen.add(item.id);
    attentionItems.push(item);
  }

  return {
    contractValue,
    billedToDate,
    thisPeriod: thisPeriodTotal,
    balanceToFinish: balanceTotal,
    retainageHeld: retainageTotal,
    netToDate: netTotal,
    pctComplete,
    overBilledCount,
    pendingApprovalCount,
    draftCount,
    billingProgress,
    byDivision,
    attentionItems,
  };
}
