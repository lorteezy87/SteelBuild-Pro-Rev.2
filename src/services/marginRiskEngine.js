/**
 * marginRiskEngine.js — Deterministic margin-at-risk scoring.
 *
 * Calculates estimated margin exposure from operational signals:
 * open RFIs, rejected submittals, crew stacking, late procurement,
 * overtime trends, failed inspections, schedule slips, excessive handling.
 *
 * Every score is explainable — no ML, no hidden formulas.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function normalize(v) { return String(v || "").trim().toLowerCase(); }
function asDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? new Date(v) : new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysBetween(a, b) {
  const da = asDate(a), db = asDate(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / DAY_MS);
}

// --- Risk signal scorers ---

function scoreRfiRisk(rfis = []) {
  // Open RFIs = delay/rework risk
  const items = [];
  let totalExposure = 0;
  for (const rfi of rfis) {
    if (!rfi || rfi.is_deleted) continue;
    const status = normalize(rfi.status);
    if (["closed", "answered", "draft"].includes(status)) continue;

    const ageDays = daysBetween(rfi.submitted_date || rfi.created_at, new Date());
    const costImpact = num(rfi.cost_impact_amount);
    const scheduleDays = num(rfi.schedule_impact_days);

    // Exposure: direct cost + estimated delay cost ($2k/day default for steel)
    let exposure = costImpact;
    if (scheduleDays > 0) exposure += scheduleDays * 2000;
    if (ageDays > 14 && !costImpact) exposure += ageDays * 500; // aging penalty

    const severity = rfi.priority === "Critical" ? "critical"
      : rfi.priority === "High" ? "high"
      : ageDays > 21 ? "high" : "medium";

    if (exposure > 0 || ageDays > 7) {
      totalExposure += exposure;
      items.push({
        signal: "open_rfi",
        label: `${rfi.rfi_number || "RFI"}: ${rfi.title || "Untitled"}`,
        severity,
        exposure,
        detail: `${ageDays}d old${costImpact ? `, $${costImpact.toLocaleString()} cost impact` : ""}${scheduleDays ? `, ${scheduleDays}d schedule impact` : ""}`,
        entityType: "RFI",
        entityId: rfi.id,
        area: rfi.area_sequence || null,
        workPackageId: rfi.work_package_id || null,
      });
    }
  }
  return { signal: "open_rfis", label: "Open RFIs", risk: "delay/rework", totalExposure, items };
}

function scoreSubmittalRisk(submittals = []) {
  const items = [];
  let totalExposure = 0;
  for (const sub of submittals) {
    if (!sub || sub.is_deleted) continue;
    const status = normalize(sub.status || sub.review_status || sub.submittal_status || "");
    const isRevise = status.includes("revise") || status.includes("resubmit") || status.includes("rejected");
    if (!isRevise) continue;

    const ageDays = daysBetween(sub.submitted_date || sub.created_at, new Date());
    // Each revision cycle costs ~$3k-5k in detailing churn + 5 days delay
    const exposure = 4000 + (ageDays > 14 ? ageDays * 300 : 0);
    totalExposure += exposure;

    items.push({
      signal: "rejected_submittal",
      label: `${sub.submittal_number || "Submittal"}: ${sub.title || sub.description || "Untitled"}`,
      severity: ageDays > 21 ? "critical" : "high",
      exposure,
      detail: `Rejected/revise — ${ageDays}d since submission`,
      entityType: "Submittal",
      entityId: sub.id,
    });
  }
  return { signal: "rejected_submittals", label: "Rejected Submittals", risk: "detailing/fab churn", totalExposure, items };
}

function scoreLaborBurnRisk(workPackages = []) {
  const items = [];
  let totalExposure = 0;
  for (const wp of workPackages) {
    if (!wp || wp.is_deleted) continue;
    const budgetHours = num(wp.shop_hours_budget) + num(wp.field_hours_budget);
    const actualHours = num(wp.shop_hours_actual) + num(wp.field_hours_actual);
    if (budgetHours <= 0) continue;

    const burnRate = actualHours / budgetHours;
    const pctComplete = num(wp.percent_complete);

    // If burn rate exceeds progress rate, we're losing margin
    // Projected overrun = (actualHours / (pctComplete/100)) - budgetHours
    if (pctComplete > 10 && burnRate > 0) {
      const projectedTotal = pctComplete > 0 ? (actualHours / (pctComplete / 100)) : actualHours * 2;
      const overrun = projectedTotal - budgetHours;
      if (overrun > 0) {
        // Assume $85/hr blended labor rate for steel
        const exposure = Math.round(overrun * 85);
        totalExposure += exposure;
        items.push({
          signal: "labor_overrun",
          label: `${wp.wp_number || wp.name || "WP"}: ${Math.round(burnRate * 100)}% burn at ${pctComplete}% complete`,
          severity: burnRate > 1.15 ? "critical" : burnRate > 1.0 ? "high" : "medium",
          exposure,
          detail: `${Math.round(overrun)}h projected overrun at $85/hr`,
          entityType: "WorkPackage",
          entityId: wp.id,
          area: wp.area || null,
          workPackageId: wp.id,
        });
      }
    }
  }
  return { signal: "labor_burn", label: "Labor Burn", risk: "productivity loss", totalExposure, items };
}

function scoreProcurementRisk(deliveries = []) {
  const items = [];
  let totalExposure = 0;
  const CLOSED = new Set(["delivered", "received", "complete", "completed", "cancelled", "canceled", "closed"]);

  for (const del of deliveries) {
    if (!del || del.is_deleted || CLOSED.has(normalize(del.status))) continue;
    const requiredDate = asDate(del.required_date || del.scheduled_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!requiredDate) continue;

    const daysLate = Math.round((today - requiredDate) / DAY_MS);
    const isLate = daysLate > 0;
    const isAtRisk = normalize(del.status).includes("delay") || normalize(del.status).includes("hold");

    if (isLate || isAtRisk) {
      // Late material = acceleration cost + idle crew cost
      const exposure = isLate ? daysLate * 3500 : 2000;
      totalExposure += exposure;
      items.push({
        signal: "late_procurement",
        label: `${del.delivery_number || del.po_number || "Delivery"}: ${del.description || ""}`,
        severity: daysLate > 7 ? "critical" : isLate ? "high" : "medium",
        exposure,
        detail: isLate ? `${daysLate}d late — acceleration/idle crew cost` : "At risk — potential delay",
        entityType: "Delivery",
        entityId: del.id,
        area: del.area || null,
        workPackageId: del.work_package_id || null,
      });
    }
  }
  return { signal: "late_procurement", label: "Late Procurement", risk: "acceleration cost", totalExposure, items };
}

function scoreInspectionRisk(inspections = []) {
  const items = [];
  let totalExposure = 0;
  for (const insp of inspections) {
    if (!insp || insp.is_deleted) continue;
    const rejected = normalize(insp.sign_off_status).includes("reject") || normalize(insp.status).includes("fail");
    const deficiencies = num(insp.deficiencies_count);
    if (!rejected && deficiencies <= 0) continue;

    // Each failed inspection = rework cost
    const exposure = rejected ? 8000 : deficiencies * 2000;
    totalExposure += exposure;
    items.push({
      signal: "failed_inspection",
      label: `${insp.inspection_number || "Inspection"}: ${insp.inspection_type || insp.location || ""}`,
      severity: rejected ? "high" : "medium",
      exposure,
      detail: rejected ? "Failed — requires rework" : `${deficiencies} deficiencies`,
      entityType: "Inspection",
      entityId: insp.id,
      area: insp.location || null,
    });
  }
  return { signal: "failed_inspections", label: "Failed Inspections", risk: "rework", totalExposure, items };
}

function scoreScheduleSlipRisk(scheduleTasks = []) {
  const items = [];
  let totalExposure = 0;
  for (const task of scheduleTasks) {
    if (!task || task.is_deleted) continue;
    const status = normalize(task.status);
    if (["complete", "completed", "closed"].includes(status)) continue;

    const endDate = asDate(task.end_date);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (!endDate) continue;

    const daysLate = Math.round((today - endDate) / DAY_MS);
    const pct = num(task.percent_complete);
    if (daysLate <= 0 || pct >= 100) continue;

    // Schedule slip = potential LD exposure + knock-on delay
    const isCritical = task.is_critical_path || task.is_milestone;
    const exposure = isCritical ? daysLate * 5000 : daysLate * 1500;
    totalExposure += exposure;
    items.push({
      signal: "schedule_slip",
      label: `${task.task_number || task.wbs_code || "Task"}: ${task.task_name || task.name || ""}`,
      severity: daysLate > 14 ? "critical" : daysLate > 7 ? "high" : "medium",
      exposure,
      detail: `${daysLate}d late, ${pct}% complete${isCritical ? " — CRITICAL PATH" : ""}`,
      entityType: "ScheduleTask",
      entityId: task.id,
      area: task.area || task.zone || null,
      workPackageId: task.work_package_id || null,
    });
  }
  return { signal: "schedule_slips", label: "Schedule Slips", risk: "liquidated damages", totalExposure, items };
}

function scoreChangeOrderRisk(changeOrders = []) {
  const items = [];
  let totalExposure = 0;
  for (const co of changeOrders) {
    if (!co || co.is_deleted) continue;
    const status = normalize(co.status);
    if (["approved", "closed", "void", "voided"].includes(status)) continue;

    const amount = Math.abs(num(co.co_amount));
    if (amount <= 0) continue;

    const ageDays = daysBetween(co.submitted_date || co.created_at, new Date());
    // Unsigned COs = uncertain margin
    totalExposure += amount;
    items.push({
      signal: "unsigned_co",
      label: `${co.co_number || "CO"}: ${co.title || "Untitled"}`,
      severity: amount > 50000 ? "critical" : amount > 10000 ? "high" : "medium",
      exposure: amount,
      detail: `$${amount.toLocaleString()} ${status} — ${ageDays}d old`,
      entityType: "ChangeOrder",
      entityId: co.id,
    });
  }
  return { signal: "unsigned_cos", label: "Unsigned Change Orders", risk: "uncertain margin", totalExposure, items };
}

// --- Main export ---

export function calculateMarginRisk(sources = {}) {
  const signals = [
    scoreRfiRisk(sources.rfis),
    scoreSubmittalRisk(sources.submittals),
    scoreLaborBurnRisk(sources.workPackages),
    scoreProcurementRisk(sources.deliveries),
    scoreInspectionRisk(sources.inspections),
    scoreScheduleSlipRisk(sources.scheduleTasks),
    scoreChangeOrderRisk(sources.changeOrders),
  ];

  const totalExposure = signals.reduce((sum, s) => sum + s.totalExposure, 0);
  const allItems = signals.flatMap(s => s.items).sort((a, b) => b.exposure - a.exposure);

  // Exposure by area
  const byArea = {};
  for (const item of allItems) {
    const area = item.area || "Unassigned";
    if (!byArea[area]) byArea[area] = { area, exposure: 0, items: [] };
    byArea[area].exposure += item.exposure;
    byArea[area].items.push(item);
  }

  // Exposure by work package
  const byWorkPackage = {};
  for (const item of allItems) {
    const wpId = item.workPackageId || "unlinked";
    if (!byWorkPackage[wpId]) byWorkPackage[wpId] = { workPackageId: wpId, exposure: 0, items: [] };
    byWorkPackage[wpId].exposure += item.exposure;
    byWorkPackage[wpId].items.push(item);
  }

  // Severity summary
  const critical = allItems.filter(i => i.severity === "critical").length;
  const high = allItems.filter(i => i.severity === "high").length;
  const medium = allItems.filter(i => i.severity === "medium").length;

  return {
    totalExposure,
    signals,
    allItems,
    byArea: Object.values(byArea).sort((a, b) => b.exposure - a.exposure),
    byWorkPackage: Object.values(byWorkPackage).sort((a, b) => b.exposure - a.exposure),
    severity: { critical, high, medium },
    topRisks: allItems.slice(0, 10),
  };
}
