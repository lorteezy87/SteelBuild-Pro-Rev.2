// ── portfolioDerive — pure portfolio roll-ups ────────────────────────────
//
// Single-input derivations extracted from PortfolioView so the dashboard's
// summary math is named, testable, and out of the 2,000-line container. Each
// takes one prop array and returns a plain summary — no React, no state. Bodies
// are byte-identical to the originals (with defensive `|| []` guards added).
import { summarizeProjectSchedule } from "./portfolioTimeline";
import { statusIn, parseUTCDate, isOverdue, daysOverdue } from "../shared/formatters";
import { computeWeightedHealth, HEALTH_ORDER, psrHealthProvenance } from "./portfolioHealth";

/**
 * Split every change order into trust buckets: approved (committed), pending
 * (priced, likely to hit budget), unpriced (scope not yet priced), disputed
 * (rejected but still on the table). Void COs are excluded. `totalExposure` =
 * pending + disputed. `cost_impact_amount` is the legacy pre-migration field.
 */
export function computeCoExposure(allCOs) {
  const byBucket = {
    approved: { amount: 0, items: [] },
    pending:  { amount: 0, items: [] },
    unpriced: { amount: 0, items: [] },
    disputed: { amount: 0, items: [] },
  };
  for (const co of allCOs || []) {
    const amt = Number(co.co_amount ?? co.cost_impact_amount ?? 0);
    const status = String(co.status || "").trim();
    if (status === "Void") continue;

    let bucket = null;
    if (status === "Approved") bucket = "approved";
    else if (["Draft", "Submitted", "Under Review"].includes(status)) {
      bucket = amt > 0 ? "pending" : "unpriced";
    } else if (status === "Rejected" && amt > 0) {
      bucket = "disputed";
    }
    if (!bucket) continue;

    byBucket[bucket].amount += amt;
    byBucket[bucket].items.push(co);
  }
  const totalExposure = byBucket.pending.amount + byBucket.disputed.amount;
  return { ...byBucket, totalExposure };
}

/** Group schedule tasks by project_id and summarize each (project_id → summary). */
export function summarizeSchedulesByProject(allScheduleTasks) {
  const byProject = {};
  for (const t of allScheduleTasks || []) {
    if (!t.project_id) continue;
    if (!byProject[t.project_id]) byProject[t.project_id] = [];
    byProject[t.project_id].push(t);
  }
  const out = {};
  for (const [pid, tasks] of Object.entries(byProject)) {
    out[pid] = summarizeProjectSchedule(tasks);
  }
  return out;
}

/** Total tonnage across all work packages. */
export function computeTotalTons(allWPs) {
  return (allWPs || []).reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

/** Tonnage that's reached fabrication or beyond and is in progress / complete. */
export function computeFabricatedTonnage(allWPs) {
  const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
  return (allWPs || [])
    .filter((w) => (PHASE_RANK[w.phase] ?? -1) >= 1 && ["In Progress", "Complete"].includes(w.status))
    .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
}

/** Delivery board: scheduled / in-transit / late counts, the 3 latest late, and the next upcoming. */
export function computeDeliveriesStats(allDeliveries) {
  const list = allDeliveries || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isLate = (d) => {
    if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
    const sched = parseUTCDate(d.scheduled_date);
    return sched && sched < today;
  };
  const scheduled = list.filter((d) => statusIn(d.status, ["Scheduled"])).length;
  const inTransit = list.filter((d) => statusIn(d.status, ["In Transit"])).length;
  const lateAll = list.filter(isLate);
  const late = lateAll.length;
  const lateList = lateAll
    .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0))
    .slice(0, 3)
    .map((d) => {
      const sched = parseUTCDate(d.scheduled_date);
      return {
        ...d,
        daysLate: sched ? Math.max(0, Math.floor((today - sched) / 86400000)) : 0,
      };
    });
  // Next upcoming delivery
  const upcoming = list
    .filter((d) => {
      if (statusIn(d.status, ["Delivered"]) || !d.scheduled_date) return false;
      const sched = parseUTCDate(d.scheduled_date);
      return sched && sched >= today;
    })
    .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0));
  const nextDelivery = upcoming[0] || null;
  return { scheduled, inTransit, late, lateList, nextDelivery };
}

/** Average RFI turnaround in days (submitted → responded) for closed RFIs, or null when none. */
export function computeRfiTurnaround(allRFIs) {
  const closed = (allRFIs || []).filter((r) => statusIn(r.status, ["Answered", "Closed"]) && r.submitted_date && r.responded_date);
  if (closed.length === 0) return null;
  const totalDays = closed.reduce((s, r) => {
    const submitted = parseUTCDate(r.submitted_date);
    const responded = parseUTCDate(r.responded_date);
    if (!submitted || !responded) return s;
    return s + Math.max(0, Math.floor((responded - submitted) / 86400000));
  }, 0);
  return (totalDays / closed.length).toFixed(1);
}

/** Data-completeness exceptions: per-project gaps (budget/contract/phase) + portfolio-wide RFI/CO gaps. */
export function computeDataIssues(enrichedMetrics, allRFIs, allCOs) {
  const issues = [];
  (enrichedMetrics || []).forEach((p) => {
    if (!p.hasBudgetData) issues.push({ project: p.name || p.project_number, projectId: p.id, issue: "No budget / cost codes set up", severity: "high", fix: "Set up cost codes" });
    if (!p.original_contract_value) issues.push({ project: p.name || p.project_number, projectId: p.id, issue: "Missing contract value", severity: "high", fix: "Enter contract value" });
    if (!p.phase) issues.push({ project: p.name || p.project_number, projectId: p.id, issue: "No phase assigned", severity: "medium", fix: "Set project phase" });
  });
  // RFIs without due dates
  const rfisNoDue = (allRFIs || []).filter((r) => !r.due_date && !statusIn(r.status, ["Answered", "Closed"]));
  if (rfisNoDue.length > 0) issues.push({ project: `${rfisNoDue.length} RFIs`, projectId: null, issue: "RFIs missing due dates", severity: "high", fix: "Add due dates" });
  // COs without values
  const cosNoVal = (allCOs || []).filter((c) => !c.co_amount && !statusIn(c.status, ["Rejected", "Void"]));
  if (cosNoVal.length > 0) issues.push({ project: `${cosNoVal.length} COs`, projectId: null, issue: "COs missing dollar values", severity: "medium", fix: "Add CO amounts" });
  return issues;
}

/** Change-order pipeline + margin-at-risk, given the CO list and the portfolio KPI roll-up. */
export function computeFinancials(allCOs, portfolioKPIs) {
  const cos = allCOs || [];
  const approvedCOs = cos.filter((c) => statusIn(c.status, ["Approved"]));
  const pendingCOs = cos.filter((c) => statusIn(c.status, ["Submitted", "Under Review"]));
  const rejectedCOs = cos.filter((c) => statusIn(c.status, ["Rejected"]));
  const approvedValue = approvedCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const pendingValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const rejectedValue = rejectedCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const totalBudget = portfolioKPIs.totalBudget;
  const totalSpend = portfolioKPIs.totalSpend;
  const remaining = totalBudget - totalSpend;
  const marginAtRisk = pendingValue + (totalSpend > totalBudget ? totalSpend - totalBudget : 0);
  return { approvedCOs: approvedCOs.length, pendingCOs: pendingCOs.length, rejectedCOs: rejectedCOs.length, approvedValue, pendingValue, rejectedValue, remaining, marginAtRisk, totalBudget, totalSpend };
}

/**
 * Priority Command Center data: today's ranked priorities (overdue RFIs / late
 * deliveries / overdue action items), the "waiting on" external-response list,
 * and the risk watchlist. Pure over the prop arrays + projectMap + enrichedMetrics.
 */
export function computePccData(allRFIs, allActionItems, allDeliveries, allCOs, projectMap, enrichedMetrics) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const pmap = projectMap || {};

  // TODAY'S PRIORITIES — ranked by severity, deterministic
  const priorities = [];

  // Overdue RFIs — blocking scope
  const overdueRFIs = (allRFIs || [])
    .filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"]))
    .sort((a, b) => new Date(a.due_date || 0) - new Date(b.due_date || 0));
  overdueRFIs.forEach((r) => {
    const days = Math.max(0, daysOverdue(r.due_date));
    priorities.push({
      rank: r.priority === "Critical" ? 0 : days >= 14 ? 1 : 2,
      type: "RFI", id: r.rfi_number || "—",
      title: r.title, project: r.project_name || pmap[r.project_id] || "",
      owner: r.assigned_to || r.ball_in_court || "Unassigned",
      days, severity: r.priority === "Critical" ? "critical" : days >= 7 ? "high" : "medium",
      action: days >= 14 ? "Escalate immediately" : days >= 7 ? "Follow up today" : "Response needed",
      nav: "RFIs",
    });
  });

  // Late deliveries — blocking erection
  const lateDeliveries = (allDeliveries || [])
    .filter((d) => {
      if (statusIn(d.status, ["Delivered"]) || !d.scheduled_date) return false;
      const sched = parseUTCDate(d.scheduled_date);
      return sched && sched < now;
    })
    .sort((a, b) => (parseUTCDate(a.scheduled_date) || 0) - (parseUTCDate(b.scheduled_date) || 0));
  lateDeliveries.forEach((d) => {
    const sched = parseUTCDate(d.scheduled_date);
    const days = sched ? Math.max(0, Math.floor((now - sched) / 86400000)) : 0;
    priorities.push({
      rank: days >= 7 ? 1 : 3,
      type: "DEL", id: d.delivery_id || "—",
      title: d.description || d.vendor || "Delivery",
      project: pmap[d.project_id] || "",
      owner: d.vendor || "Vendor",
      days, severity: days >= 7 ? "high" : "medium",
      action: days >= 7 ? "Expedite — blocking production" : "Track status with vendor",
      nav: "Deliveries",
    });
  });

  // Overdue action items
  const overdueAI = (allActionItems || [])
    .filter((a) => {
      if (statusIn(a.status, ["Complete", "Cancelled", "Closed", "Done"])) return false;
      if (!a.due_date) return false;
      const due = parseUTCDate(a.due_date);
      return due && due < now;
    })
    .sort((a, b) => (parseUTCDate(a.due_date) || 0) - (parseUTCDate(b.due_date) || 0));
  overdueAI.forEach((a) => {
    const due = parseUTCDate(a.due_date);
    const days = due ? Math.max(0, Math.floor((now - due) / 86400000)) : 0;
    priorities.push({
      rank: 4, type: "ACTION", id: "—",
      title: a.title || "Action Item", project: a.project_name || pmap[a.project_id] || "",
      owner: a.assigned_to || "Unassigned",
      days, severity: days >= 7 ? "medium" : "low",
      action: "Close out or reassign",
      nav: "ActionItems",
    });
  });

  priorities.sort((a, b) => a.rank - b.rank || b.days - a.days);

  // WAITING ON — items pending external response.
  // Use the same "open RFI" definition as the KPI tile (anything NOT
  // Answered/Closed) so the two views can never disagree about counts.
  const waitingOn = [];
  (allRFIs || []).filter((r) => !statusIn(r.status, ["Answered", "Closed", "Draft"])).forEach((r) => {
    const sub = parseUTCDate(r.submitted_date);
    waitingOn.push({
      type: "RFI", id: r.rfi_number || "—",
      title: r.title, project: r.project_name || pmap[r.project_id] || "",
      waitingFor: r.assigned_to || r.ball_in_court || "Architect/Engineer",
      submitted: r.submitted_date,
      days: sub ? Math.max(0, Math.floor((now - sub) / 86400000)) : 0,
      nav: "RFIs",
    });
  });
  // COs under review
  (allCOs || []).filter((c) => statusIn(c.status, ["Submitted", "Under Review"])).forEach((c) => {
    const sub = parseUTCDate(c.submitted_date);
    waitingOn.push({
      type: "CO", id: c.co_number || "—",
      title: c.title, project: c.project_name || pmap[c.project_id] || "",
      waitingFor: "Owner/GC",
      submitted: c.submitted_date,
      days: sub ? Math.max(0, Math.floor((now - sub) / 86400000)) : 0,
      amount: Number(c.co_amount) || 0,
      nav: "ChangeOrders",
    });
  });
  // Deliveries in transit
  (allDeliveries || []).filter((d) => statusIn(d.status, ["In Transit"])).forEach((d) => {
    waitingOn.push({
      type: "DEL", id: d.delivery_id || "—",
      title: d.description || d.vendor || "Delivery",
      project: pmap[d.project_id] || "",
      waitingFor: d.vendor || "Vendor",
      submitted: d.scheduled_date,
      days: 0,
      nav: "Deliveries",
    });
  });
  waitingOn.sort((a, b) => b.days - a.days);

  // RISK WATCHLIST — projects trending toward trouble
  const riskWatch = (enrichedMetrics || [])
    .filter((p) => p.effectiveHealth !== "On Track" || p.healthScore < 80)
    .sort((a, b) => (a.healthScore || 0) - (b.healthScore || 0))
    .slice(0, 5)
    .map((p) => ({
      project: p.name || p.project_number,
      projectId: p.id,
      score: p.healthScore,
      status: p.effectiveHealth,
      reasons: p.healthReasons || [],
      topReason: p.healthReasons?.[0] || "Scoring below threshold",
    }));

  return { priorities, waitingOn, riskWatch };
}

/** project_id → display name. */
export function computeProjectMap(projects) {
  const map = {};
  for (const p of projects || []) map[p.id] = p.name || p.project_name || "";
  return map;
}

/**
 * Per-project metric roll-up: budget/actual, RFI/CO/delivery/WP counts, tonnage,
 * and projected margin. Sorted worst-health-first. Pure over the project + all
 * cross-entity prop arrays.
 */
export function computeProjectMetrics(projects, allRFIs, allCOs, allCodes, allWPs, allDeliveries, allExpenses) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (projects || [])
    .map((p) => {
      const pRFIs = (allRFIs || []).filter((r) => r.project_id === p.id);
      const pCOs = (allCOs || []).filter((c) => c.project_id === p.id);
      const pCodes = (allCodes || []).filter((c) => c.project_id === p.id);
      const pWPs = (allWPs || []).filter((w) => w.project_id === p.id);
      const pDeliveries = (allDeliveries || []).filter((d) => d.project_id === p.id);
      const pExpenses = (allExpenses || []).filter((e) => e.project_id === p.id && !statusIn(e.payment_status, ["Voided", "Void"]));
      const budget = pCodes.reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
      const hasBudgetData = pCodes.length > 0;
      const paidExpenses = pExpenses.filter((e) => statusIn(e.payment_status, ["Paid"]));
      const actual = paidExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      // hasActualData must mirror the slice that produces `actual` — otherwise
      // a project with only Submitted/Approved (unpaid) expenses shows as
      // "has data" while actual stays $0, faking a green Variance cell.
      const hasActualData = paidExpenses.length > 0;
      const openRFIs = pRFIs.filter((r) => !statusIn(r.status, ["Answered", "Closed"])).length;
      const overdueRFIs = pRFIs.filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
      const avgProgress = pWPs.length > 0 ? Math.round(pWPs.reduce((s, w) => s + (Number(w.percent_complete) || 0), 0) / pWPs.length) : 0;
      const pendingCOs = pCOs.filter((c) => statusIn(c.status, ["Submitted", "Under Review"]));
      const pendingCOValue = pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
      const lateDeliveries = pDeliveries.filter((d) => {
        if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
        const sched = parseUTCDate(d.scheduled_date);
        return sched && sched < today;
      }).length;
      const tonnage = Math.round(pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0));
      const stalledWPs = pWPs.filter((w) => statusIn(w.status, ["On Hold"])).length;

      // Projected Margin = Contract Value - Estimated Cost at Completion.
      // Estimated cost takes the worst case of (budget) vs (actual + pending CO exposure)
      // so the figure tells us "what the project will actually return if pending COs hit".
      const contractValue = Number(p.original_contract_value) || 0;
      const estimatedCostAtCompletion = Math.max(budget, actual + pendingCOValue);
      const projectedMargin = contractValue > 0 ? contractValue - estimatedCostAtCompletion : null;
      const projectedMarginPct = contractValue > 0 ? (projectedMargin / contractValue) * 100 : null;

      return {
        ...p,
        budget,
        actual,
        hasBudgetData,
        hasActualData,
        openRFIs,
        overdueRFIs,
        avgProgress,
        pendingCOs,
        pendingCOValue,
        lateDeliveries,
        tonnage,
        stalledWPs,
        contractValue,
        estimatedCostAtCompletion,
        projectedMargin,
        projectedMarginPct,
      };
    })
    .sort((a, b) => (HEALTH_ORDER[a.health_status] ?? 3) - (HEALTH_ORDER[b.health_status] ?? 3));
}

/**
 * Portfolio-level KPI roll-up: contract value, budget/spend, RFI/CO/delivery
 * counts, at-risk projects, cash-at-risk (pending CO + over-budget exposure),
 * and forecast-at-completion / variance. Pure over the prop arrays +
 * enrichedMetrics (for the health + forecast figures).
 */
export function computePortfolioKPIs(projects, allRFIs, allCOs, allCodes, allWPs, allExpenses, allDeliveries, enrichedMetrics) {
  const portfolioValue =
    (projects || []).reduce((s, p) => s + (Number(p.original_contract_value) || 0), 0) +
    (allCOs || []).filter((c) => statusIn(c.status, ["Approved"])).reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
  const totalBudget = (allCodes || []).reduce((s, c) => s + (Number(c.budget_amount) || 0), 0);
  const totalSpend = (allExpenses || []).filter((e) => statusIn(e.payment_status, ["Paid"])).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const overdueRFIs = (allRFIs || []).filter((r) => isOverdue(r.due_date, r.status, ["Answered", "Closed"])).length;
  const openRFIs = (allRFIs || []).filter((r) => !statusIn(r.status, ["Answered", "Closed"])).length;
  const pendingCOs = (allCOs || []).filter((c) => statusIn(c.status, ["Submitted", "Under Review"])).length;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const lateDeliveries = (allDeliveries || []).filter((d) => {
    if (!d.scheduled_date || statusIn(d.status, ["Delivered"])) return false;
    const sched = parseUTCDate(d.scheduled_date);
    return sched && sched < todayStart;
  }).length;
  const atRisk = (enrichedMetrics || []).filter((p) => p.effectiveHealth === "At Risk" || p.effectiveHealth === "Watch").length;
  const activeWPs = (allWPs || []).filter((w) => statusIn(w.status, ["In Progress"])).length;
  // Stale RFIs: open RFIs whose age exceeds 30 days. We canonicalize on
  // submitted_date (when the RFI was actually issued) and fall back to
  // created_date / created_at only when missing. Parse via parseUTCDate so
  // ISO date-only strings don't drift in negative-UTC timezones.
  const thirtyDaysAgo = todayStart.getTime() - 30 * 86400000;
  const staleRFIs30 = (allRFIs || []).filter((r) => {
    if (statusIn(r.status, ["Answered", "Closed"])) return false;
    const opened = r.submitted_date || r.created_date || r.created_at;
    const d = parseUTCDate(opened);
    if (!d) return false;
    return d.getTime() < thirtyDaysAgo;
  });

  // Cash at risk — the combined dollar value of exposures the PM team
  // should be actively managing right now. Two buckets:
  //   1. Pending change-order value. COs in Submitted/Under Review/
  //      Draft state are dollars that have been proposed but aren't
  //      committed either way. They're "at risk" in the sense that a
  //      rejection erodes margin we thought we had.
  //   2. Over-budget exposure. For each cost_code where actual spend
  //      exceeds the budget amount, we accumulate (actual - budget).
  //      That's the delta we're bleeding past plan.
  // Sum is the single number the exec asks: "how much cash is in
  // limbo across our portfolio right now?"
  const pendingCOValue = (allCOs || [])
    .filter((c) => statusIn(c.status, ["Submitted", "Under Review", "Draft"]))
    .reduce((s, c) => s + (Number(c.co_amount) || Number(c.cost_impact_amount) || 0), 0);

  // Build a map of actual-spend-per-cost-code so we can compare to
  // budgets. expenses.cost_code holds the cost-code NUMBER (text); the
  // schema has no cost_code_id on expenses, so cost_code (number) is the
  // only key we can build the spend map from.
  const spendByCode = new Map();
  for (const e of allExpenses || []) {
    if (!statusIn(e.payment_status, ["Paid"])) continue;
    const key = e.cost_code || null;
    if (!key) continue;
    spendByCode.set(key, (spendByCode.get(key) || 0) + (Number(e.amount) || 0));
  }
  let overBudgetExposure = 0;
  for (const code of allCodes || []) {
    const budget = Number(code.budget_amount) || 0;
    if (budget <= 0) continue;
    // The cost_codes row identifies its code via cost_code_number (the legacy
    // `code` column is always NULL on real rows); expenses join by that same
    // number in expenses.cost_code, which is how spendByCode is keyed above.
    const actual = spendByCode.get(code.cost_code_number) || 0;
    if (actual > budget) overBudgetExposure += (actual - budget);
  }

  const cashAtRisk = pendingCOValue + overBudgetExposure;

  // Portfolio-level Forecast at Completion (FAC):
  //   FAC = sum of per-project estimatedCostAtCompletion, where each
  //         project's estimate = max(budget, actual + pending CO
  //         exposure). Answers the exec question "if everything
  //         pending lands the way we expect, what will these jobs
  //         actually cost us?"
  //
  // Forecast Variance = FAC - Total Budget. Positive = we're
  // forecasting more cost than we budgeted (margin fade); negative
  // = we're forecasting below budget (margin gain).
  const forecastAtCompletion = (enrichedMetrics || []).reduce(
    (sum, p) => sum + (Number(p.estimatedCostAtCompletion) || 0),
    0,
  );
  const forecastVariance = forecastAtCompletion - totalBudget;

  return {
    portfolioValue, totalBudget, totalSpend,
    overdueRFIs, openRFIs, pendingCOs, lateDeliveries, atRisk, activeWPs, staleRFIs30,
    cashAtRisk, pendingCOValue, overBudgetExposure,
    forecastAtCompletion, forecastVariance,
  };
}

/** Layer weighted-health scoring onto each project metric. Auto (live) vs manual
 * (`health_status`) health, worst wins — EXCEPT a STALE PSR-snapshot manual verdict
 * (driftRisk) is ignored so live data wins, instead of a weeks-old import keeping a
 * closed-out job stuck at "At Risk". Carries the PSR provenance through (psrProvenance)
 * so the portfolio can still flag the stale import. */
export function enrichProjectMetrics(projectMetrics) {
  return (projectMetrics || []).map((p) => {
    const weighted = computeWeightedHealth(p);
    const prov = psrHealthProvenance(p);
    const manual = p.health_status || "On Track";
    const SEVERITY = { "At Risk": 0, "Watch": 1, "On Track": 2 };
    const autoSev = SEVERITY[weighted.label] ?? 2;
    const manualSev = SEVERITY[manual] ?? 2;
    // A stale snapshot verdict doesn't get to drag health down: when the manual
    // health is a stale snapshot still on the column (driftRisk), trust the live
    // auto-health. Otherwise keep the conservative worst-of.
    const effectiveHealth = prov.driftRisk
      ? weighted.label
      : (autoSev <= manualSev ? weighted.label : manual);
    return {
      ...p,
      healthScore: weighted.score,
      healthFactors: weighted.factors,
      healthReasons: weighted.reasons,
      autoHealth: weighted.label,
      effectiveHealth,
      psrProvenance: prov,
    };
  });
}

/** Budget-vs-actual chart rows for the top 8 projects, with not-started / accounting-delayed flags. */
export function computeBudgetChartData(projectMetrics) {
  return (projectMetrics || []).slice(0, 8).map((p) => {
    const progress = Number(p.avgProgress) || 0;
    const hasActual = p.actual > 0;
    // Distinguishes "haven't started" (0% progress, $0 actual) from
    // "delayed accounting" (>0% progress, $0 actual) so the chart isn't
    // misleading when several rows show $0 spend.
    const accountingDelayed = !hasActual && progress > 5;
    const notStarted = !hasActual && progress <= 5;
    const shortName = p.project_number || (p.name || "").slice(0, 10);
    return {
      name: `${shortName} · ${progress}%`,
      rawName: shortName,
      Budget: p.budget,
      Actual: p.actual,
      progress,
      overBudget: p.actual > p.budget,
      accountingDelayed,
      notStarted,
    };
  });
}

/** Per-project production readiness: fab tonnage %, WP status counts, constraints, erection-ready flag. */
export function computeProductionData(enrichedMetrics, allWPs) {
  const PHASE_RANK = { Detailing: 0, Fabrication: 1, Delivery: 2, Erection: 3 };
  const wps = allWPs || [];
  return (enrichedMetrics || []).map((p) => {
    const pWPs = wps.filter((w) => w.project_id === p.id);
    const inFab = pWPs.filter((w) => statusIn(w.status, ["In Progress"]));
    const complete = pWPs.filter((w) => statusIn(w.status, ["Complete"]));
    const onHold = pWPs.filter((w) => statusIn(w.status, ["On Hold"]));
    const totalTon = pWPs.reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    // Cumulative fab tonnage: WPs at Fabrication or later AND actively worked
    const fabTon = pWPs
      .filter((w) => (PHASE_RANK[w.phase] ?? -1) >= 1 && ["In Progress", "Complete"].includes(w.status))
      .reduce((s, w) => s + (Number(w.tonnage) || 0), 0);
    const fabPct = totalTon > 0 ? Math.round((fabTon / totalTon) * 100) : 0;
    // Constraints: WPs on hold, missing drawings, late deliveries
    const constraints = [];
    if (onHold.length > 0) constraints.push(`${onHold.length} WP${onHold.length > 1 ? "s" : ""} on hold`);
    if (p.overdueRFIs > 0) constraints.push(`${p.overdueRFIs} overdue RFI${p.overdueRFIs > 1 ? "s" : ""} blocking scope`);
    if (p.lateDeliveries > 0) constraints.push(`${p.lateDeliveries} late delivery — material gap`);
    const erectionReady = p.lateDeliveries === 0 && onHold.length === 0 && p.overdueRFIs === 0;
    return { ...p, inFabCount: inFab.length, completeCount: complete.length, onHoldCount: onHold.length, totalTon, fabTon, fabPct, constraints, erectionReady, wpTotal: pWPs.length };
  });
}
