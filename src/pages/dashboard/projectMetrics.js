/**
 * Derived metrics for the project dashboard.
 *
 * Translates the prototype's flat `MOCK_PROJECT` shape into real
 * computations over Supabase entities. Keeps the dashboard component
 * presentational — every number below comes from live data.
 */

export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

export function daysRemaining(project) {
  const target = project?.forecast_completion_date || project?.target_completion_date;
  if (!target) return null;
  return Math.max(0, daysBetween(new Date(), target) ?? 0);
}

export function timelineElapsedPct(project) {
  const start  = project?.start_date;
  const target = project?.target_completion_date;
  if (!start || !target) return 0;
  const total   = daysBetween(start, target);
  const elapsed = daysBetween(start, new Date());
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((elapsed || 0) / total) * 100)));
}

/**
 * Revised contract value = original + approved change orders. Falls
 * back to `original_contract_value` when no COs are loaded yet.
 */
export function revisedContractValue(project, cos = []) {
  const base = Number(project?.original_contract_value) || 0;
  const approvedDelta = cos
    .filter((c) => c.status === "Approved")
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  return base + approvedDelta;
}

/** Sum of cost-code budget_amount — the budgeted spend. */
export function budgetCommitted(costCodes = []) {
  return costCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
}

/** Sum of all expenses regardless of status — total committed costs. */
export function committedCosts(expenses = []) {
  return expenses
    .filter((e) => e.payment_status !== "Voided")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

/** Paid-to-date — expenses where payment_status === 'Paid'. */
export function costToDate(expenses = []) {
  return expenses
    .filter((e) => e.payment_status === "Paid")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

/** Cost variance = budget_committed − committed_costs. Positive = under budget. */
export function costVariance(costCodes = [], expenses = []) {
  return budgetCommitted(costCodes) - committedCosts(expenses);
}

/** Average percent_complete across all work packages. */
export function wpProgressPct(wps = []) {
  if (!wps.length) return 0;
  const sum = wps.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0);
  return Math.round(sum / wps.length);
}

/** Sum of work package tonnage. */
export function totalTons(wps = []) {
  return wps.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

/**
 * Phase rollup — counts of WPs in each phase + total count.
 * Drives the phase pipeline chevron on the Dashboard hero.
 */
export function phaseRollup(wps = []) {
  const phases = ["Detailing", "Fabrication", "Delivery", "Erection"];
  const counts = phases.reduce((acc, p) => {
    acc[p] = wps.filter((w) => w.phase === p).length;
    return acc;
  }, {});
  // Active phase = the latest phase with any work packages; default to
  // the project's declared phase when available, else the first non-empty.
  let activeIdx = 0;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (counts[phases[i]] > 0) { activeIdx = i; break; }
  }
  return { phases, counts, activeIdx };
}

/**
 * Fab progress — average percent_complete of WPs whose phase is
 * Fabrication or later (i.e. anything that's already been detailed).
 */
export function fabProgressPct(wps = []) {
  const past = wps.filter((w) =>
    ["Fabrication", "Delivery", "Erection"].includes(w.phase)
  );
  if (!past.length) return 0;
  const sum = past.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0);
  return Math.round(sum / past.length);
}

/**
 * Erected progress — among WPs in Erection phase, how many are
 * Complete. Rough approximation; refine once we track "actually
 * erected tonnage" separately.
 */
export function erectedProgressPct(wps = []) {
  const erecting = wps.filter((w) => w.phase === "Erection");
  if (!erecting.length) return 0;
  const done = erecting.filter((w) => w.status === "Complete").length;
  return Math.round((done / erecting.length) * 100);
}

/** Count of RFIs where status ∉ Answered/Closed. */
export function openRFICount(rfis = []) {
  return rfis.filter((r) => !["Answered", "Closed"].includes(r.status)).length;
}

/** Count of RFIs past `date_required` and not yet answered. */
export function overdueRFICount(rfis = []) {
  const now = new Date();
  return rfis.filter(
    (r) =>
      !["Answered", "Closed"].includes(r.status) &&
      r.date_required &&
      new Date(r.date_required) < now
  ).length;
}

/** Deliveries not yet delivered + past scheduled date. */
export function overdueDeliveryCount(deliveries = []) {
  const now = new Date();
  return deliveries.filter(
    (d) =>
      d.status !== "Delivered" &&
      d.scheduled_date &&
      new Date(d.scheduled_date) < now
  ).length;
}

/** Deliveries that are scheduled but not yet in transit. */
export function scheduledDeliveryCount(deliveries = []) {
  return deliveries.filter((d) => d.status === "Scheduled").length;
}

/**
 * RFI aging buckets — 0-7, 8-14, 15-30, 30+ days open.
 * Returns counts + total + percentage each bucket contributes.
 */
export function rfiAgingBuckets(rfis = []) {
  const open = rfis.filter((r) => !["Answered", "Closed"].includes(r.status));
  const now = new Date();
  const buckets = { "0-7": 0, "8-14": 0, "15-30": 0, "30+": 0 };
  open.forEach((r) => {
    const created = r.submitted_date || r.created_at;
    if (!created) return;
    const days = Math.floor((now - new Date(created)) / 86400000);
    if (days <= 7) buckets["0-7"]++;
    else if (days <= 14) buckets["8-14"]++;
    else if (days <= 30) buckets["15-30"]++;
    else buckets["30+"]++;
  });
  const total = open.length || 1;
  return [
    { label: "0-7 DAYS",   count: buckets["0-7"],   pct: Math.round((buckets["0-7"]   / total) * 100), color: "var(--status-success)" },
    { label: "8-14 DAYS",  count: buckets["8-14"],  pct: Math.round((buckets["8-14"]  / total) * 100), color: "var(--status-warning)" },
    { label: "15-30 DAYS", count: buckets["15-30"], pct: Math.round((buckets["15-30"] / total) * 100), color: "var(--status-review)"  },
    { label: "30+ DAYS",   count: buckets["30+"],   pct: Math.round((buckets["30+"]   / total) * 100), color: "var(--status-error)"   },
  ];
}

/**
 * Returns the oldest open RFI's age in days — for the "oldest 41d"
 * sub-metric in the aging card header.
 */
export function oldestOpenRFIAgeDays(rfis = []) {
  const open = rfis.filter((r) => !["Answered", "Closed"].includes(r.status));
  if (!open.length) return 0;
  const now = new Date();
  const ages = open
    .map((r) => r.submitted_date || r.created_at)
    .filter(Boolean)
    .map((d) => Math.floor((now - new Date(d)) / 86400000));
  return Math.max(0, ...ages);
}

/**
 * Monthly spend breakdown for the last 6 months — returns
 * `[{ month, actual, committed }]` for the FinancialSnapshot mini
 * bar chart on the Dashboard.
 */
export function monthlySpendBreakdown(expenses = []) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      month: d.toLocaleString("default", { month: "short" }),
      actual: 0,
      committed: 0,
    });
  }
  const active = expenses.filter((e) => e.payment_status !== "Voided");
  active.forEach((e) => {
    if (!e.expense_date) return;
    const d = new Date(e.expense_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.find((mm) => mm.key === key);
    if (!m) return;
    const amt = Number(e.amount) || 0;
    m.committed += amt;
    if (e.payment_status === "Paid") m.actual += amt;
  });
  return months;
}
