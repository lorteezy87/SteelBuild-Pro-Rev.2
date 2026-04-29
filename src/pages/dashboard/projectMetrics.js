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

/**
 * Budget-hours variance — sums shop & field budget vs actual across
 * the budget_hour_items rows for a project, mirroring the rollup
 * shown on the Budget Hours page so the Financial Controls panel can
 * render a one-glance "Hours Variance" tile.
 *
 * Returns null fields when there's no budget set (so callers can
 * render "—" rather than 0 / 0). When a row carries
 * `metadata.linked_work_package_ids[]`, the actuals roll up from
 * those WPs' shop/field actuals — same logic as BudgetHours.jsx so
 * the dashboard can't drift from the page that owns the data.
 */
export function budgetHoursVariance(items = [], wps = []) {
  const wpsById = new Map();
  for (const w of wps) if (w?.id) wpsById.set(w.id, w);
  let sb = 0, sa = 0, fb = 0, fa = 0;
  for (const r of items) {
    if (!r || r.is_deleted) continue;
    if (r.category === "Misses") continue;
    sb += Number(r.shop_hours_budget) || 0;
    fb += Number(r.field_hours_budget) || 0;
    const linked = r?.metadata?.linked_work_package_ids;
    if (Array.isArray(linked) && linked.length) {
      for (const id of linked) {
        const wp = wpsById.get(id);
        if (!wp) continue;
        sa += Number(wp.shop_hours_actual) || 0;
        fa += Number(wp.field_hours_actual) || 0;
      }
    } else {
      sa += Number(r.shop_hours_actual) || 0;
      fa += Number(r.field_hours_actual) || 0;
    }
  }
  const pct = (b, a) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0);
  return {
    shopBudget: sb,
    shopActual: sa,
    shopVariancePct: pct(sb, sa),
    fieldBudget: fb,
    fieldActual: fa,
    fieldVariancePct: pct(fb, fa),
    totalBudget: sb + fb,
    totalActual: sa + fa,
    totalVariancePct: pct(sb + fb, sa + fa),
    hasBudget: sb + fb > 0,
  };
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
 * Fabrication status rollup — maps each work package to the Fab
 * Release page's 7-stage shop pipeline so the project dashboard can
 * surface "X packages in fab, Y ready to ship" without re-implementing
 * the staging logic in two places. Mirrors getFabStage in
 * src/pages/FabRelease.jsx.
 */
export function fabStatusRollup(wps = []) {
  const stages = [
    "drawings_approved", "material_on_hand", "shop_released",
    "in_fabrication", "fabricated", "finish_treatment", "ready_to_ship",
  ];
  const counts = stages.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
  let totalTons = 0;
  let shippedTons = 0;
  for (const w of wps) {
    if (!w) continue;
    const stage = deriveFabStage(w);
    if (counts[stage] !== undefined) counts[stage]++;
    const tons = Number(w.tonnage) || 0;
    totalTons += tons;
    if (stage === "ready_to_ship") shippedTons += tons;
  }
  // Active stage = the latest stage (in pipeline order) that has any
  // packages; ties at zero default to drawings_approved.
  let activeIdx = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (counts[stages[i]] > 0) { activeIdx = i; break; }
  }
  return {
    stages,
    counts,
    total: wps.length,
    totalTons,
    shippedTons,
    activeStage: stages[activeIdx],
  };
}

/** Mirror of FabRelease's getFabStage. Kept here so the dashboard
 *  doesn't need to import the page module just for this. */
function deriveFabStage(wp) {
  const phase = wp?.phase || "";
  const status = wp?.status || "";
  const pct = Number(wp?.percent_complete) || 0;
  if (["Delivery", "Installation", "Closeout"].includes(phase)) return "ready_to_ship";
  if (phase === "Fabrication") {
    if (status === "Complete" || pct === 100) return "ready_to_ship";
    if (pct >= 75) return "finish_treatment";
    if (pct >= 25 || status === "In Progress") return "in_fabrication";
    if (wp?.released_date) return "shop_released";
    if (wp?.vif_confirmed && wp?.load_list_complete) return "material_on_hand";
    return "drawings_approved";
  }
  if (phase === "Detailing") {
    if (status === "Complete") return "material_on_hand";
    return "drawings_approved";
  }
  return "drawings_approved";
}

/**
 * Procurement status rollup — buckets non-deleted procurement
 * deliveries (anything with a non-null procurement_category) by their
 * 7-stage workflow status. Mirrors the Procurement page's PIPELINE_STATUSES
 * order so the dashboard chevron strip can deep-link directly into
 * `/Procurement?status=<stage>`.
 *
 * Cancelled is intentionally excluded from the chevron (it's a
 * sidebar/filter on the page itself, not a pipeline column) but still
 * counted in `cancelled` so callers can surface a separate badge if
 * they want to.
 *
 * Each row's "long lead" status comes from the boolean `is_long_lead`
 * column, NOT the legacy "Long-Lead Item" category — that was the bug
 * the rebuild fixed so this helper matches the page's KPI logic.
 */
export function procurementStatusRollup(deliveries = []) {
  const stages = [
    "Identified", "Quoted", "PO Issued", "Confirmed",
    "In Production", "Shipped", "Received",
  ];
  const counts = stages.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
  let total = 0;
  let totalWeight = 0;
  let longLead = 0;
  let longLeadSlipping = 0;
  let cancelled = 0;
  const today = new Date();

  for (const d of deliveries) {
    if (!d || d.is_deleted) continue;
    if (!d.procurement_category) continue;
    total++;
    totalWeight += Number(d.weight_tons) || 0;
    if (d.is_long_lead) {
      longLead++;
      // Implied ship date = order_placed_date + lead_time_weeks*7,
      // unless the user already entered an expected_ship_date.
      const lead = Number(d.lead_time_weeks) || 0;
      let implied = d.expected_ship_date || null;
      if (!implied && d.order_placed_date && lead > 0) {
        const dt = new Date(d.order_placed_date);
        if (!Number.isNaN(dt.getTime())) {
          dt.setDate(dt.getDate() + Math.round(lead * 7));
          implied = dt.toISOString().slice(0, 10);
        }
      }
      if (implied && d.required_date
        && new Date(implied) > new Date(d.required_date)
        && d.status !== "Received" && d.status !== "Cancelled") {
        longLeadSlipping++;
      }
    }
    if (d.status === "Cancelled") {
      cancelled++;
      continue;
    }
    if (counts[d.status] !== undefined) counts[d.status]++;
  }

  // Active stage = the latest stage in pipeline order that has rows.
  // Falls back to "Identified" when nothing's started yet so the UI
  // anchor always points somewhere.
  let activeIdx = 0;
  for (let i = stages.length - 1; i >= 0; i--) {
    if (counts[stages[i]] > 0) { activeIdx = i; break; }
  }

  // Overdue = required_date in the past and not yet Received/Cancelled.
  let overdue = 0;
  for (const d of deliveries) {
    if (!d || d.is_deleted || !d.procurement_category) continue;
    if (d.status === "Received" || d.status === "Cancelled") continue;
    if (!d.required_date) continue;
    if (new Date(d.required_date) < today) overdue++;
  }

  return {
    stages,
    counts,
    total,
    totalWeight,
    longLead,
    longLeadSlipping,
    cancelled,
    overdue,
    activeStage: stages[activeIdx],
  };
}

/**
 * Count of work packages that are past their scheduled end date and
 * not yet Complete. Drives the OVERDUE stat tile on the Schedule &
 * Timeline panel — was previously hardcoded to 0.
 */
export function overdueWPCount(wps = []) {
  const today = new Date();
  return wps.filter((w) => {
    if (!w?.scheduled_end_date) return false;
    if (w.status === "Complete") return false;
    const due = new Date(w.scheduled_end_date);
    return Number.isFinite(due.getTime()) && due < today;
  }).length;
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
 * 6-stage Work-Package pipeline rollup. Drives the "Work Package
 * Pipeline" chevron strip on the new sectioned dashboard.
 *
 * The schema uses two columns: `phase ∈ {Detailing, Fabrication,
 * Delivery, Erection}` and `status ∈ {Not Started, In Progress,
 * Complete}`. The prototype's pipeline is a single linear flow that
 * combines them, so we map the (phase, status) tuple to one of six
 * display stages:
 *
 *   status="Not Started"                          → Not Started
 *   phase="Detailing"   + status="In Progress"    → Detailing
 *   phase="Detailing"   + status="Complete"       → Released   (detailed, ready for fab)
 *   phase="Fabrication" + status="In Progress"    → Fabrication
 *   phase="Fabrication" + status="Complete"       → Complete   (fabbed, ready to ship)
 *   phase ∈ {Delivery, Erection} (any status)     → Shipped
 *
 * "Hold", "Cancelled", and unknown values fall through to "Not Started"
 * so they're still visible (rather than silently dropped from the
 * total). The previous version keyed the rollup off the prototype's
 * stage names (`status === "Released"`, etc.) which never matched real
 * data — every In-Progress + Erection row landed in "Complete", which
 * was wrong.
 */
export function wpPipelineRollup(wps = []) {
  const stages = [
    "Not Started", "Detailing", "Released",
    "Fabrication", "Complete", "Shipped",
  ];
  const counts = stages.reduce((acc, s) => { acc[s] = 0; return acc; }, {});
  for (const w of wps) {
    const status = w?.status;
    const phase = w?.phase;
    if (phase === "Delivery" || phase === "Erection") {
      counts["Shipped"]++;
    } else if (status === "Complete" && phase === "Fabrication") {
      counts["Complete"]++;
    } else if (status === "Complete" && phase === "Detailing") {
      counts["Released"]++;
    } else if (status === "In Progress" && phase === "Fabrication") {
      counts["Fabrication"]++;
    } else if (status === "In Progress" && phase === "Detailing") {
      counts["Detailing"]++;
    } else {
      // Not Started / Hold / Cancelled / no-phase / unknown.
      counts["Not Started"]++;
    }
  }
  return { stages, counts, total: wps.length };
}

/**
 * RFI status rollup — 5 buckets matching the prototype. "Pending"
 * collapses Under Review + Incomplete Response (both wait on the
 * BIC), "Responded" maps to the canonical "Answered" status.
 */
export function rfiStatusRollup(rfis = []) {
  const buckets = {
    Draft:     0,
    Submitted: 0,
    Pending:   0,
    Responded: 0,
    Closed:    0,
  };
  for (const r of rfis) {
    const s = r?.status;
    if (s === "Draft") buckets.Draft++;
    else if (s === "Submitted") buckets.Submitted++;
    else if (s === "Under Review" || s === "Incomplete Response") buckets.Pending++;
    else if (s === "Answered") buckets.Responded++;
    else if (s === "Closed") buckets.Closed++;
  }
  return buckets;
}

/**
 * Submittal pipeline rollup — 6 detailing-stage buckets:
 *   OFA = Out For Approval     · with EOR/Architect
 *   BFA = Back From Approval   · returned, needs revision
 *   OFS = Out For Scrub        · in-house QA review
 *   BFS = Back From Scrub      · QA returned, ready for next round
 *   FFF = Final For Fab        · approved as noted, ready
 *   Released = Released for Fabrication
 *
 * In this app submittals are tracked as **drawing sets**, not
 * individual drawings. A set ("Anchor Bolts", "Stairs A & B", etc.)
 * is what gets sent out for approval, scrub, and fab release — every
 * drawing inside the set rides the same workflow stage. The
 * dashboard panel shows ONE row per set, so a 36-sheet "Embeds &
 * Lintels" set at OFA counts as 1 OFA, not 36.
 *
 * The function detects which kind of input it received:
 *   - Rows with `drawing_set_id` are drawings → group by set, derive
 *     the set's stage from its drawings (most-common; ties pick the
 *     earliest stage in the canonical workflow order so a set that's
 *     mid-transition lands in the upstream bucket).
 *   - Rows with a `set_name` but no `drawing_set_id` are drawing_set
 *     records → each row's `stage_summary` (or derived stage from
 *     metadata) drives one bucket.
 *   - Anything else falls through to the legacy submittals shape
 *     (status + ball_in_court).
 */
export function submittalPipelineRollup(rows = []) {
  const stages = ["OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
  const counts = stages.reduce((acc, s) => { acc[s] = 0; return acc; }, {});

  // 1. If any rows look like drawings (have drawing_set_id), bucket
  //    by set_id rather than per-drawing.
  const drawings = rows.filter((r) => r && !r.is_deleted && r.drawing_set_id);
  const setIdsSeen = new Set();
  if (drawings.length) {
    const bySet = new Map();
    for (const d of drawings) {
      const key = d.drawing_set_id;
      if (!bySet.has(key)) bySet.set(key, []);
      bySet.get(key).push(d);
    }
    for (const [setId, sheets] of bySet.entries()) {
      setIdsSeen.add(setId);
      const setStage = pickDominantStage(sheets.map((s) => s?.stage), stages);
      if (setStage && counts[setStage] !== undefined) counts[setStage]++;
    }
  }

  // 2. Legacy / non-drawing rows — submittals records, drawing_sets
  //    rows passed directly, etc. Skip drawings rows already counted.
  for (const r of rows) {
    if (!r || r.is_deleted) continue;
    if (r.drawing_set_id) continue;             // already counted above
    if (r.id && setIdsSeen.has(r.id)) continue; // a drawing_set we already saw via drawings

    // a) drawing_sets table row — uses stage_summary
    if (r.stage_summary && counts[r.stage_summary] !== undefined) {
      counts[r.stage_summary]++;
      continue;
    }
    // b) legacy submittals row with explicit stage
    const explicit = r?.stage || r?.current_stage;
    if (explicit && counts[explicit] !== undefined) {
      counts[explicit]++;
      continue;
    }
    // c) legacy submittals fallback — derive from status + ball_in_court
    const status = r?.status;
    const bic    = r?.ball_in_court;
    if (status === "Approved" && r?.approved_date) counts["Released"]++;
    else if (status === "Approved") counts["FFF"]++;
    else if (status === "Approved as Noted") counts["BFS"]++;
    else if (status === "Revise and Resubmit" || status === "Rejected") counts["BFA"]++;
    else if ((status === "Submitted" || status === "Under Review") && bic === "EOR") counts["OFS"]++;
    else if (status === "Submitted" || status === "Under Review" || status === "Draft") counts["OFA"]++;
    // Void / unknown → skipped.
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { stages, counts, total };
}

/**
 * For a set whose sheets sit at varying stages, pick the canonical
 * stage to display. Strategy: most-common; on ties, pick the EARLIEST
 * stage in the canonical workflow order so a partially-progressed set
 * shows up in the upstream bucket (better-PMs-want-to-finish-it
 * principle than over-counting it as released).
 */
function pickDominantStage(stageList, canonicalOrder) {
  const tally = {};
  for (const s of stageList) {
    if (!s) continue;
    tally[s] = (tally[s] || 0) + 1;
  }
  const counts = Object.entries(tally);
  if (!counts.length) return null;
  const max = Math.max(...counts.map(([, n]) => n));
  const top = counts.filter(([, n]) => n === max).map(([s]) => s);
  // Tie-break by canonical workflow order (OFA earliest, Released latest).
  top.sort((a, b) => canonicalOrder.indexOf(a) - canonicalOrder.indexOf(b));
  return top[0];
}

/**
 * Ball-in-court rollup for OPEN RFIs — counts of RFIs by who owes the
 * next response. Five canonical categories used in the prototype:
 * Architect / Engineer / GC / Owner / Internal.
 */
export function ballInCourtRollup(rfis = []) {
  const buckets = { Architect: 0, Engineer: 0, GC: 0, Owner: 0, Internal: 0 };
  const open = rfis.filter((r) => !["Answered", "Closed"].includes(r.status));
  for (const r of open) {
    const bic = String(r?.ball_in_court || "").trim();
    if (bic === "Architect")    buckets.Architect++;
    else if (bic === "Engineer" || bic === "EOR") buckets.Engineer++;
    else if (bic === "GC" || bic === "Contractor") buckets.GC++;
    else if (bic === "Owner")   buckets.Owner++;
    else                        buckets.Internal++;
  }
  return buckets;
}

/** Sum of co_amount across pending COs (Submitted + Under Review). */
export function pendingCOTotal(cos = []) {
  return cos
    .filter((c) => ["Submitted", "Under Review"].includes(c.status))
    .reduce((s, c) => s + (Number(c.co_amount) || 0), 0);
}

/**
 * Effective $/ton: revised contract value divided by total work-package
 * tonnage. Returns null when tonnage is zero so the UI can render "—"
 * instead of an Infinity.
 */
export function pricePerTon(project, cos = [], wps = []) {
  const value = revisedContractValue(project, cos);
  const tons = totalTons(wps);
  if (!tons || tons <= 0) return null;
  return value / tons;
}

/**
 * Daily burn rate — total paid spend / days since project start.
 * Returns 0 when no paid expenses or no start date.
 */
export function burnRatePerDay(expenses = [], project) {
  const paid = costToDate(expenses);
  if (!paid) return 0;
  const start = project?.start_date;
  const elapsed = start ? Math.max(1, daysBetween(start, new Date()) || 1) : 1;
  return paid / elapsed;
}

/**
 * Projected final cost — extrapolate from the current burn rate
 * forward to the project's target completion. Falls back to the
 * already-committed total when there's no schedule.
 */
export function projectedFinalCost(expenses = [], project) {
  const committed = committedCosts(expenses);
  const start = project?.start_date;
  const target = project?.target_completion_date;
  if (!start || !target) return committed;
  const totalDays = daysBetween(start, target);
  const elapsed   = daysBetween(start, new Date());
  if (!totalDays || totalDays <= 0) return committed;
  if (!elapsed || elapsed <= 0) return committed;
  const burn = burnRatePerDay(expenses, project);
  return Math.max(committed, burn * totalDays);
}

/**
 * Projected margin = (revised contract value − projected final cost)
 * / revised contract value. Returns 0 when contract value is zero.
 */
export function projectedMargin(project, cos = [], expenses = []) {
  const value = revisedContractValue(project, cos);
  if (!value) return 0;
  const proj = projectedFinalCost(expenses, project);
  return ((value - proj) / value) * 100;
}

/**
 * SOV ROW MODEL — IMPORTANT
 *
 * The `sov_items` table stores ONE ROW PER (project_id, line_item_number,
 * application_number, status) tuple. Each pay application typically has
 * a Draft row + a Certified row for every line item, so a project with
 * 33 line items and 5 applications can hold 5 × 2 × 33 = 330 rows.
 *
 * That means a naïve `Σ scheduled_value × current_percent_complete / 100`
 * across all rows DOUBLE / TRIPLE COUNTS billings — a $24K line item
 * that closed at 100% in app #5 contributes:
 *   - app 1 Certified (0%)        → 0
 *   - app 5 Draft (100%)          → 24,000
 *   - app 5 Certified (100%)      → 24,000
 * …so the billed total reads $48K instead of $24K.
 *
 * Live data confirms this: 163 rows / 33 line items / 5 apps for the
 * sample project = the ~3× overcount the audit caught. Always go
 * through `latestCertifiedPerLineItem()` (or sum `period_delta` over
 * Certified rows for monthly resolution) — never roll over the raw set.
 */

/**
 * Reduce a raw `sov_items` collection to one row per
 * (project_id, line_item_number) — keeping the row from the highest
 * `application_number` whose status is in the "billed" set
 * (Certified, Paid). Drafts and uncertified rows are dropped because
 * they're not real billings yet.
 *
 * Paid is a downstream state of Certified — once a pay app is paid the
 * row's status flips from Certified to Paid. Including Paid here means
 * `cashCollected` can still find the row via `payment_received_date`.
 *
 * This is the "billed-to-date snapshot" view of the SOV: every line
 * item appears at most once, and its current_percent_complete is the
 * cumulative billed-percent through the latest pay app.
 */
const BILLED_SOV_STATUSES = new Set(["Certified", "Paid"]);

export function latestCertifiedPerLineItem(sovItems = []) {
  const byKey = new Map();
  for (const r of sovItems) {
    if (!r || r.is_deleted) continue;
    if (!BILLED_SOV_STATUSES.has(r.status)) continue;
    const key = `${r.project_id ?? ""}|${r.line_item_number ?? ""}`;
    const cur = byKey.get(key);
    const app = Number(r.application_number) || 0;
    if (!cur || app > (Number(cur.application_number) || 0)) {
      byKey.set(key, r);
    }
  }
  return [...byKey.values()];
}

/**
 * Total billed across SOV (cumulative billings) — billed-to-date based
 * on the latest Certified pay-app row per line item. See the comment on
 * `latestCertifiedPerLineItem` for why this dedupe is required.
 */
export function totalBilled(sovItems = []) {
  return latestCertifiedPerLineItem(sovItems).reduce(
    (s, i) => s + (Number(i.scheduled_value) || 0) * (Number(i.current_percent_complete) || 0) / 100,
    0,
  );
}

/**
 * Cash collected — billed-to-date for line items whose latest certified
 * pay-app row carries a payment_received_date (i.e. the certified app
 * for that line item has been paid). Same dedupe story as totalBilled.
 */
export function cashCollected(sovItems = []) {
  return latestCertifiedPerLineItem(sovItems)
    .filter((i) => i.payment_received_date)
    .reduce(
      (s, i) => s + (Number(i.scheduled_value) || 0) * (Number(i.current_percent_complete) || 0) / 100,
      0,
    );
}

/**
 * Outstanding pay applications — line items whose latest Certified row
 * is submitted but not yet paid. Returns `{ count, total }` so the UI
 * can show "($N apps) $X".
 *
 * `count` is line-item count, not pay-app count. That's what the UI was
 * already showing pre-fix — relabeling would break callers. The audit
 * is fine with that interpretation since "pending value" is what
 * matters operationally.
 */
export function pendingPayment(sovItems = []) {
  const items = latestCertifiedPerLineItem(sovItems)
    .filter((i) => i.submitted_date && !i.payment_received_date);
  const total = items.reduce(
    (s, i) => s + (Number(i.scheduled_value) || 0) * (Number(i.current_percent_complete) || 0) / 100,
    0,
  );
  return { count: items.length, total };
}

/**
 * Retention held — sum of retainage withheld across SOV items.
 *
 * Computed as: scheduled_value × current_percent_complete% × retainage_percent%
 * over the deduped (one-row-per-line-item) Certified set. The schema
 * stores `retainage_percent` (e.g. 10 for 10%), not a precomputed
 * dollar amount. (An earlier version of this helper had a fallback for
 * a literal `retention_held` column, but that column never shipped —
 * dropped the dead branch.)
 */
export function retentionHeld(sovItems = []) {
  return latestCertifiedPerLineItem(sovItems).reduce((s, i) => {
    const sched = Number(i?.scheduled_value) || 0;
    const pct   = Number(i?.current_percent_complete) || 0;
    const ret   = Number(i?.retainage_percent) || 0;
    return s + (sched * pct * ret) / 10000;
  }, 0);
}

/**
 * Per-application-period billed delta for each Certified SOV row.
 *
 * The monthly trend chart needs "how much was billed THIS month", not
 * "cumulative through this month". Each Certified row already carries
 * `current_percent_complete` and `previous_percent_complete`, so the
 * period delta in dollars is:
 *
 *   delta = scheduled_value × (current_pct − previous_pct) / 100
 *
 * Returns an array of `{ periodTo, submittedDate, delta, projectId,
 * lineItemNumber }` for every Certified row. Drafts are excluded; the
 * row is keyed on the application period. If `previous_percent_complete`
 * is null/undefined, it's treated as 0 (a brand-new line item).
 */
export function certifiedPeriodDeltas(sovItems = []) {
  const out = [];
  for (const r of sovItems) {
    if (!r || r.is_deleted) continue;
    if (!BILLED_SOV_STATUSES.has(r.status)) continue;
    const sched = Number(r.scheduled_value) || 0;
    const cur   = Number(r.current_percent_complete) || 0;
    const prev  = Number(r.previous_percent_complete) || 0;
    const delta = (sched * (cur - prev)) / 100;
    if (!delta) continue;
    out.push({
      projectId: r.project_id,
      lineItemNumber: r.line_item_number,
      applicationNumber: r.application_number,
      periodTo: r.period_to,
      submittedDate: r.submitted_date,
      delta,
    });
  }
  return out;
}

/**
 * Task distribution by type — counts of schedule tasks bucketed by
 * `task_type`. The prototype originally split by responsible party
 * (S&H / GC / EOR / Architect), but neither schedule_tasks nor
 * action_items carries a `assigned_party` / `responsible_party`
 * column — only `assigned_to` (a free-text name). Distributing by
 * party therefore always read zero on real data.
 *
 * The actual column with useful breakdown is `task_type` (Task /
 * Submittal / Install / Fabrication / Delivery / Milestone), which
 * the rest of the schedule UI already drives off. Buckets default
 * to that vocabulary; tasks of other types collapse into "Other"
 * so the sum still equals the total number of tasks.
 */
export function taskDistributionByType(scheduleTasks = []) {
  const TYPES = ["Fabrication", "Delivery", "Install", "Submittal", "Task", "Milestone", "Other"];
  const result = TYPES.reduce((acc, t) => {
    acc[t] = { tasks: 0, inProgress: 0 };
    return acc;
  }, {});
  for (const t of scheduleTasks) {
    if (!t) continue;
    // Tasks with an unknown / missing task_type land in the "Other"
    // bucket so the panel total matches scheduleTasks.length and a
    // mis-tagged row still shows up somewhere instead of silently
    // disappearing from the rollup.
    const type = TYPES.includes(t.task_type) ? t.task_type : "Other";
    result[type].tasks++;
    const status = t?.status;
    if (status === "In Progress" || status === "Open" || status === "Active") {
      result[type].inProgress++;
    }
  }
  return result;
}

/**
 * Back-compat alias. Some legacy callers still import this name; the
 * panel renamed itself "by Type" but we keep the export so any
 * unexpected importer doesn't break.
 */
export const taskDistributionByParty = taskDistributionByType;

/**
 * Pick the top-N most-recent drawing-activity events for a project,
 * formatted for the Recent Activity feed. Falls back to an empty list
 * when the input is empty.
 *
 * Each input row has the shape from `drawing_activity`:
 *   { id, project_id, drawing_id, event_type, from_value, to_value,
 *     actor_id, metadata, created_at }
 *
 * Behaviour notes (from the dashboard audit):
 *   - Clustered bursts. When the same project moves a whole drawing
 *     SET in one go (e.g. dragging 40 sheets from BFA → OFS), the
 *     feed previously surfaced 40 near-duplicate "Stage BFA → OFS · X"
 *     rows that crowded out everything else. We now group consecutive
 *     events that share (event_type, from_value, to_value, set_name)
 *     within a 5-minute sliding window into a single row labelled
 *     "Stage BFA → OFS · Set Foo · 40 sheets".
 *   - Drawing-deletion events are demoted out of the feed by default
 *     (kept on the underlying table for audit, but they're not
 *     "activity worth surfacing" once the row is already gone).
 *   - Missing labels use "—" rather than "?" so a row without a
 *     from_value reads as "Stage — → OFS" instead of the original
 *     "Stage ? → ?" which the user reported as confusing.
 *
 * The output is a stable shape the UI can render uniformly:
 *   [{ id, summary, when, kind, count }]
 */
export function recentActivityFeed(drawingActivity = [], limit = 8) {
  const NOISY_KINDS = new Set(["deleted"]);
  const CLUSTER_WINDOW_MS = 5 * 60 * 1000;

  // Newest-first chronological order.
  const sorted = (drawingActivity || []).slice().sort((a, b) =>
    String(b?.created_at || "").localeCompare(String(a?.created_at || ""))
  );

  // Drop noisy event types from the feed proper. They still live in
  // the underlying drawing_activity table for audit / forensic work.
  const surfaced = sorted.filter((r) => !NOISY_KINDS.has(r?.event_type));

  // Cluster consecutive bursts that share (kind, from→to, set name).
  // Walking newest-first means each new cluster's `when` is the most
  // recent event in the burst — which is the right anchor to show in
  // the relative-time column.
  const clusters = [];
  for (const r of surfaced) {
    const ev   = r?.event_type || "event";
    const from = r?.from_value ?? null;
    const to   = r?.to_value ?? null;
    const meta = r?.metadata && typeof r.metadata === "object" ? r.metadata : {};
    const setName = meta.set_name || null;
    const sheet   = meta.sheet_number || meta.drawing_number || null;
    const tsMs    = r?.created_at ? new Date(r.created_at).getTime() : NaN;
    const clusterKey = `${ev}|${from}|${to}|${setName || ""}`;

    const last = clusters[clusters.length - 1];
    const sameBurst =
      last &&
      last.key === clusterKey &&
      Number.isFinite(tsMs) &&
      Number.isFinite(last.firstTsMs) &&
      Math.abs(last.firstTsMs - tsMs) <= CLUSTER_WINDOW_MS;

    if (sameBurst) {
      last.count += 1;
      // Track distinct sheet labels so a single-sheet burst still
      // surfaces the sheet number rather than collapsing to "N sheets".
      if (sheet) last.sheets.add(sheet);
      // Keep the oldest-in-cluster timestamp as the cluster anchor so
      // the 5-minute window stays anchored to the burst's first event.
      if (Number.isFinite(tsMs)) last.firstTsMs = Math.min(last.firstTsMs, tsMs);
    } else {
      clusters.push({
        id: r?.id,
        key: clusterKey,
        kind: ev,
        from,
        to,
        setName,
        sheets: new Set(sheet ? [sheet] : []),
        count: 1,
        when: r?.created_at,
        firstTsMs: Number.isFinite(tsMs) ? tsMs : Number.POSITIVE_INFINITY,
      });
    }
  }

  // Render each cluster into the public feed row shape.
  const dash = (v) => (v == null || v === "" ? "—" : String(v));
  return clusters.slice(0, limit).map((c) => {
    const sheetList = [...c.sheets];
    // Pick a context label: a single sheet, or the set, or just the
    // total count if nothing was tagged.
    let context;
    if (c.count === 1 && sheetList.length === 1) {
      context = sheetList[0];
    } else if (c.setName) {
      context = `${c.setName} · ${c.count} sheet${c.count === 1 ? "" : "s"}`;
    } else if (sheetList.length === 1 && c.count > 1) {
      context = `${sheetList[0]} · ${c.count} updates`;
    } else {
      context = `${c.count} sheet${c.count === 1 ? "" : "s"}`;
    }

    let summary;
    if      (c.kind === "stage_changed")    summary = `Stage ${dash(c.from)} → ${dash(c.to)} · ${context}`;
    else if (c.kind === "approval_changed") summary = `Approval ${dash(c.from)} → ${dash(c.to)} · ${context}`;
    else if (c.kind === "revision_changed") summary = `Rev ${dash(c.from)} → ${dash(c.to)} · ${context}`;
    else if (c.kind === "superseded")       summary = `Superseded · ${context}`;
    else if (c.kind === "created")          summary = `Drawing added · ${context}`;
    else                                    summary = `${c.kind} · ${context}`;

    return {
      id: c.id,
      summary,
      when: c.when,
      kind: c.kind,
      count: c.count,
    };
  });
}

/**
 * Surface a project's milestones from schedule_tasks (task_type =
 * 'Milestone'). Sorted by start_date ascending; returns at most
 * `limit` rows so the dashboard panel doesn't get unbounded.
 *
 * If no schedule_tasks rows are tagged Milestone, fall back to
 * synthesising two synthetic milestones from the project's
 * start_date and target_completion_date so the dashboard still
 * shows something concrete to anchor the schedule against.
 */
export function projectMilestones(project, scheduleTasks = [], limit = 6) {
  const explicit = (scheduleTasks || [])
    .filter((t) => t?.task_type === "Milestone")
    .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.task_name || "Untitled milestone",
      date: t.start_date || t.end_date || null,
      status: t.status || null,
      synthetic: false,
    }));
  if (explicit.length) return explicit;
  // Fall back to project anchors when nothing's tagged.
  const fallback = [];
  if (project?.start_date) {
    fallback.push({ id: "synthetic-start", title: "Project Start", date: project.start_date, status: null, synthetic: true });
  }
  if (project?.target_completion_date) {
    fallback.push({ id: "synthetic-target", title: "Target Completion", date: project.target_completion_date, status: null, synthetic: true });
  }
  return fallback;
}

/**
 * Surface schedule_tasks the user has flagged as critical (via
 * `metadata.is_critical = true` on the row). The drawer's new
 * "Mark as critical" toggle writes that flag.
 */
export function criticalPathTasks(scheduleTasks = [], limit = 8) {
  return (scheduleTasks || [])
    .filter((t) => {
      const md = t?.metadata;
      return md && typeof md === "object" && md.is_critical === true;
    })
    .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")))
    .slice(0, limit)
    .map((t) => ({
      id: t.id,
      title: t.task_name || "Untitled task",
      start: t.start_date || null,
      end: t.end_date || null,
      status: t.status || null,
    }));
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
