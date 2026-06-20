import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronDown, GitBranch, Route, ShieldAlert, Sparkles, Target, TrendingUp, Users, Zap } from "lucide-react";
import { computeEffectiveDates } from "@/services/scheduleCascade";
import { PHASES } from "@/utils/phases";
import { Button } from "@/components/design-system";
import { formatDateShort } from "@/components/shared/formatters";
import { formatLocalDate } from "@/utils/dates";
import {
  isOpenTask, isWorkTask, taskOwner, daysFromToday, taskName, phaseOf,
  dependencyIds, dependencyCount, isCriticalTask, progressValue, taskDate,
  formatBriefTask, formatAnalysisDate, shiftedByDays,
} from "@/components/schedule/rivetBriefHelpers";

const RIVET_COLLAPSED_KEY = "steelbuild:schedule-brief-collapsed";

/** Phase-aware fix suggestions for steel construction workflows */
function phaseSpecificFix(task, context) {
  const phase = phaseOf(task).toLowerCase();
  const owner = taskOwner(task);
  const ownerNote = owner ? ` (${owner})` : "";

  if (context === "start_delay") {
    switch (phase) {
      case "detailing":
        return `Check if the modeling team${ownerNote} has the approved-for-detailing drawings and connection design. Confirm modeling hours are allocated and the detailer has current revision docs.`;
      case "fabrication":
        return `Verify that shop drawings are approved and material is procured${ownerNote}. Check if the fab shop has open capacity and the steel release package is complete.`;
      case "delivery":
        return `Confirm PO status and vendor lead times${ownerNote}. Check whether trucking is scheduled, and verify the site has a clear laydown area with crane access for unloading.`;
      case "erection":
        return `Verify crew availability and crane schedule${ownerNote}. Confirm anchor bolt surveys are done, base plates are set, and the erection sequence drawing is issued.`;
      default:
        return `Confirm the root cause with the responsible party${ownerNote}, and either mobilize the work or re-baseline the start/finish dates.`;
    }
  }

  if (context === "overdue") {
    switch (phase) {
      case "detailing":
        return `Check if the model is complete but approvals are pending${ownerNote}. Verify submittal status in the approval log — a stalled GC review can silently block this.`;
      case "fabrication":
        return `Confirm shop floor status${ownerNote} — is this piece welded, blasted, painted, or waiting on material? Update % complete or push the finish date and flag the delay to the field PM.`;
      case "delivery":
        return `Verify shipping status with the vendor${ownerNote}. If material shipped, confirm receipt and update to complete. If not, get a revised ETA and notify the erection crew.`;
      case "erection":
        return `Check field status${ownerNote} — is this piece set, bolted, or waiting on connections? If work is done, mark complete. If blocked, identify the hold (weather, crane, access) and communicate to the PM.`;
      default:
        return `Update the status if the work is done, or reset the finish date and notify downstream task owners${ownerNote}.`;
    }
  }

  return `Review owner, dates, dependencies, and current field/shop status${ownerNote} before publishing the schedule.`;
}

function buildAtRiskEntry(task, effectiveDates) {
  const name = taskName(task);
  const startLag = daysFromToday(task?.start_date);
  const finishLag = daysFromToday(task?.end_date);
  const effective = effectiveDates[task?.id];
  const shiftDays = shiftedByDays(effective);
  const criticalLabel = isCriticalTask(task) ? "critical-path " : "";
  const phase = phaseOf(task);

  const statusLower = String(task?.status || "").toLowerCase();
  if (startLag != null && startLag < 0 && progressValue(task) === 0 && !statusLower.includes("in progress") && !statusLower.includes("active") && !statusLower.includes("complete")) {
    const lateDays = Math.abs(startLag);
    return {
      task,
      label: name,
      why: `This ${criticalLabel}${phase} task was scheduled to start on ${formatDateShort(task.start_date)} but has not begun, creating a ${lateDays}-day start delay${lateDays > 7 ? " that is likely cascading to downstream work" : ""}.`,
      fix: phaseSpecificFix(task, "start_delay"),
    };
  }

  if (finishLag != null && finishLag < 0 && String(task?.status || "").toLowerCase() !== "complete") {
    const lateDays = Math.abs(finishLag);
    return {
      task,
      label: name,
      why: `This ${criticalLabel}${phase} task was due on ${formatDateShort(task.end_date)} and is now ${lateDays} day${lateDays === 1 ? "" : "s"} past due${isCriticalTask(task) ? ", directly impacting the critical path" : ""}.`,
      fix: phaseSpecificFix(task, "overdue"),
    };
  }

  if (shiftDays > 0) {
    return {
      task,
      label: name,
      why: `Dependency logic is pushing this ${phase} task ${shiftDays} day${shiftDays === 1 ? "" : "s"} later than its stored dates${isCriticalTask(task) ? " — this shift is on the critical path" : ""}.`,
      fix: `Review the predecessor chain for '${name}' and verify whether the upstream ${phase.toLowerCase()} work has actually slipped or if the link/lag needs to be corrected. ${shiftDays > 5 ? "A shift this large usually means a predecessor finish date was not updated after the work completed." : ""}`,
    };
  }

  if (!task?.start_date || !task?.end_date) {
    return {
      task,
      label: name,
      why: `This ${phase} task is missing ${!task?.start_date && !task?.end_date ? "both start and finish dates" : !task?.start_date ? "a start date" : "a finish date"}, so it cannot drive downstream planning.`,
      fix: `Work with the ${phase.toLowerCase()} lead to define the work window. ${phase === "Detailing" ? "Check when the detailer can begin and how many modeling hours are needed." : phase === "Fabrication" ? "Confirm material lead time and shop capacity to set realistic dates." : phase === "Delivery" ? "Get vendor-committed ship dates and trucking lead times." : phase === "Erection" ? "Check crane availability and crew schedule to set erection windows." : "Define scope and duration based on the responsible team's capacity."}`,
    };
  }

  return {
    task,
    label: name,
    why: `This ${criticalLabel}${phase} task carries schedule risk based on its current status, dates, and dependency position.`,
    fix: phaseSpecificFix(task, "general"),
  };
}

function buildScheduleAiNarrative({
  riskScore,
  openTasks,
  delayed,
  tbd,
  overdue,
  critical,
  stalled,
  shiftedTasks,
  effectiveDates,
  logicGaps,
  unassignedTasks,
}) {
  const atRiskTasks = [
    ...stalled.filter(isCriticalTask),
    ...overdue.filter(isCriticalTask),
    ...delayed.filter(isCriticalTask),
    ...shiftedTasks.filter(isCriticalTask),
    ...stalled,
    ...overdue,
    ...delayed,
    ...shiftedTasks,
    ...tbd,
  ];
  const seen = new Set();
  const atRisk = atRiskTasks
    .filter((task) => {
      const key = task?.id || taskName(task);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4)
    .map((task) => buildAtRiskEntry(task, effectiveDates));

  const maxCriticalStartDelay = critical.reduce((max, task) => {
    const startLag = daysFromToday(task?.start_date);
    return startLag != null && startLag < 0 && progressValue(task) === 0
      ? Math.max(max, Math.abs(startLag))
      : max;
  }, 0);
  const maxFinishDelay = overdue.reduce((max, task) => {
    const finishLag = daysFromToday(task?.end_date);
    return finishLag != null && finishLag < 0 ? Math.max(max, Math.abs(finishLag)) : max;
  }, 0);
  const maxCascadeDelay = shiftedTasks.reduce((max, task) => Math.max(max, shiftedByDays(effectiveDates[task.id])), 0);
  const forecastDelayDays = Math.max(maxCriticalStartDelay, maxFinishDelay, maxCascadeDelay);

  const riskLevel = riskScore >= 70 || (critical.length > 0 && (stalled.length > 0 || overdue.length > 0))
    ? "HIGH"
    : riskScore >= 35
      ? "MEDIUM"
      : "LOW";

  const undefinedPct = openTasks.length ? Math.round((tbd.length / openTasks.length) * 100) : 0;
  const primaryAtRisk = atRisk[0];
  const hasPrimaryDelay = Boolean(primaryAtRisk && forecastDelayDays > 0);

  // Count issues by phase for narrative context
  const phaseIssues = {};
  [...delayed, ...overdue, ...stalled].forEach(t => {
    const p = phaseOf(t);
    phaseIssues[p] = (phaseIssues[p] || 0) + 1;
  });
  const topIssuePhases = Object.entries(phaseIssues)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([phase, count]) => `${phase} (${count})`);
  const phaseContext = topIssuePhases.length ? ` Issue concentration: ${topIssuePhases.join(", ")}.` : "";

  const summary = riskLevel === "HIGH"
    ? `High schedule risk — ${delayed.length + overdue.length + stalled.length} tasks are delayed, overdue, or stalled across ${openTasks.length} open items.${primaryAtRisk ? ` '${primaryAtRisk.label}' is the primary pressure point.` : ""}${phaseContext} ${forecastDelayDays > 0 ? `Current forecast shows +${forecastDelayDays}d pressure on the critical path.` : ""} ${tbd.length ? `${undefinedPct}% of open tasks still have TBD dates, limiting downstream planning reliability.` : "Verify the critical path and publish recovery dates."}`
    : riskLevel === "MEDIUM"
      ? `Moderate schedule risk across ${openTasks.length} open tasks.${primaryAtRisk ? ` '${primaryAtRisk.label}' needs attention first.` : ""}${phaseContext} ${forecastDelayDays > 0 ? `Forecast pressure: +${forecastDelayDays}d.` : ""} Clean up dates, owners, and dependency logic before the lookahead hardens.`
      : `Low schedule risk across ${openTasks.length} open tasks.${phaseContext} ${tbd.length ? `${tbd.length} TBD-date task${tbd.length === 1 ? "" : "s"} should be resolved proactively.` : "Keep the lookahead clean by confirming dates, owners, and dependency links before they become blockers."}`;

  const blockers = [
    primaryAtRisk && hasPrimaryDelay ? `The '${primaryAtRisk.label}' task is the primary schedule blocker right now.` : null,
    tbd.length ? `${tbd.length} open task${tbd.length === 1 ? "" : "s"} still have TBD dates, blocking a complete forecast.` : null,
    logicGaps.length ? `${logicGaps.length} open task${logicGaps.length === 1 ? "" : "s"} have missing predecessor or successor logic.` : null,
    unassignedTasks.length ? `${unassignedTasks.length} open task${unassignedTasks.length === 1 ? "" : "s"} have no owner assigned.` : null,
  ].filter(Boolean).slice(0, 4);

  const sequenceSuggestions = [
    primaryAtRisk ? `Resolve or re-baseline '${primaryAtRisk.label}' (${phaseOf(primaryAtRisk.task)}) — ${primaryAtRisk.why.split(".")[0].toLowerCase()}.` : null,
    tbd.length ? `Define dates for the ${tbd.length} TBD task${tbd.length === 1 ? "" : "s"} (${undefinedPct}% of open work). Prioritize any that gate detailing starts or fabrication releases.` : null,
    logicGaps.length ? `Tighten predecessor/successor links on ${logicGaps.length} task${logicGaps.length === 1 ? "" : "s"} so critical-path movement surfaces before work slips.` : null,
    forecastDelayDays > 0 ? `Communicate the +${forecastDelayDays}d forecast pressure to the PM and affected ${[...new Set([...delayed, ...overdue].map(t => phaseOf(t).toLowerCase()))].join(", ") || "project"} teams.` : null,
    unassignedTasks.length ? `Assign owners to ${unassignedTasks.length} open task${unassignedTasks.length === 1 ? "" : "s"} before the next coordination meeting — these cannot be tracked on the lookahead without accountability.` : null,
  ].filter(Boolean).slice(0, 4);

  return {
    riskLevel,
    riskScore,
    forecastDelayDays,
    summary,
    atRisk,
    blockers,
    sequenceSuggestions,
    modelLabel: "schedule-risk-v1",
    analyzedAt: formatAnalysisDate(),
  };
}

function buildBrief(tasks) {
  const effectiveDates = computeEffectiveDates(tasks);
  const parentIds = new Set(tasks.map((task) => task?.parent_task_id).filter(Boolean));

  const openTasks = [];
  const delayed = [];
  const tbd = [];
  const critical = [];
  const overdue = [];
  const stalled = [];
  const nearTermEntries = [];
  const startsSoonEntries = [];
  const dueSoonEntries = [];
  const activeNowEntries = [];
  const unassignedAll = [];
  const shiftedAll = [];
  const criticalEntries = [];
  const depCountById = {};
  const successorCountById = {};
  const phaseStats = Object.fromEntries(
    PHASES.map((phase) => [phase, { phase, open: 0, delayed: 0, overdue: 0, tbd: 0, critical: 0 }])
  );
  let totalShiftDays = 0;

  for (const task of tasks) {
    if (!isOpenTask(task)) continue;
    const actionable = isWorkTask(task, parentIds);
    const deps = dependencyIds(task);
    depCountById[String(task.id)] = deps.length;
    deps.forEach((predId) => {
      const key = String(predId);
      successorCountById[key] = (successorCountById[key] || 0) + 1;
    });

    if (!actionable) continue;

    openTasks.push(task);

    const phaseStatsRow = phaseStats[phaseOf(task)];
    if (phaseStatsRow) phaseStatsRow.open += 1;

    const status = String(task.status || "").toLowerCase();
    const startDays = daysFromToday(task.start_date);
    const endDays = daysFromToday(task.end_date);
    const dateDays = daysFromToday(task.start_date || task.end_date);

    if (status.includes("delay")) {
      delayed.push(task);
      if (phaseStatsRow) phaseStatsRow.delayed += 1;
    }
    if (!task.start_date || !task.end_date) {
      tbd.push(task);
      if (phaseStatsRow) phaseStatsRow.tbd += 1;
    }
    if (isCriticalTask(task)) {
      critical.push(task);
      criticalEntries.push({ task, days: daysFromToday(taskDate(task)) });
      if (phaseStatsRow) phaseStatsRow.critical += 1;
    }
    if (endDays != null && endDays < 0) {
      overdue.push(task);
      if (phaseStatsRow) phaseStatsRow.overdue += 1;
    }
    if (startDays != null && startDays < 0 && progressValue(task) === 0 && !status.includes("complete") && !status.includes("in progress") && !status.includes("active")) {
      stalled.push(task);
    }
    if (dateDays != null && dateDays >= 0 && dateDays <= 42) {
      nearTermEntries.push({ task, days: dateDays });
    }
    if (startDays != null && startDays >= 0 && startDays <= 14) {
      startsSoonEntries.push({ task, days: startDays });
    }
    if (endDays != null && endDays >= 0 && endDays <= 14) {
      dueSoonEntries.push({ task, days: endDays });
    }
    if (startDays != null && endDays != null && startDays <= 0 && endDays >= 0) {
      activeNowEntries.push({ task, days: endDays });
    }
    if (!taskOwner(task)) {
      unassignedAll.push(task);
    }

    const effective = effectiveDates[task.id];
    const shiftedBy = shiftedByDays(effective);
    totalShiftDays += shiftedBy;
    if (effective?.shifted) shiftedAll.push(task);
  }

  const nearTerm = nearTermEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 6)
    .map((entry) => entry.task);
  const startsSoon = startsSoonEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)
    .map((entry) => entry.task);
  const dueSoon = dueSoonEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)
    .map((entry) => entry.task);
  const activeNow = activeNowEntries
    .sort((a, b) => a.days - b.days)
    .slice(0, 5)
    .map((entry) => entry.task);
  const handoffCount = new Set([...startsSoon, ...dueSoon, ...activeNow].map((task) => task.id || taskName(task))).size;
  const unassignedTasks = unassignedAll.slice(0, 8);
  const shiftedTasks = shiftedAll
    .sort((a, b) => shiftedByDays(effectiveDates[b.id]) - shiftedByDays(effectiveDates[a.id]))
    .slice(0, 8);
  const logicGaps = [];
  const unlinked = [];
  for (const task of openTasks) {
    const predecessorCount = depCountById[String(task.id)] || 0;
    const successorCount = successorCountById[String(task.id)] || 0;
    if ((predecessorCount === 0 || successorCount === 0) && logicGaps.length < 8) {
      logicGaps.push(task);
    }
    if (predecessorCount === 0 && !task.parent_task_id) {
      unlinked.push(task);
    }
  }
  const nextCritical = criticalEntries
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999))
    .slice(0, 5)
    .map((entry) => entry.task);

  const phaseRows = Object.values(phaseStats)
    .filter((row) => row.open > 0 || row.delayed > 0 || row.overdue > 0 || row.tbd > 0)
    .sort((a, b) => (b.delayed * 5 + b.overdue * 4 + b.critical * 3 + b.tbd) - (a.delayed * 5 + a.overdue * 4 + a.critical * 3 + a.tbd))
    .slice(0, 4);

  // Helper: summarize which phases are affected in each recovery bucket
  const phaseBreakdown = (taskList) => {
    const counts = {};
    taskList.forEach(t => { const p = phaseOf(t); counts[p] = (counts[p] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1] - a[1]).map(([p, c]) => `${c} ${p}`).join(", ");
  };

  const recoveryActions = [
    overdue.length ? {
      key: "overdue",
      title: "Clean up overdue finish dates",
      detail: `${overdue.length} open task${overdue.length === 1 ? "" : "s"} past due (${phaseBreakdown(overdue)}). The worst is '${taskName(overdue[0])}' at ${Math.abs(daysFromToday(overdue[0].end_date))}d late. Confirm actual completion status or push dates and notify downstream teams before the next coordination meeting.`,
      filter: "overdue",
      tone: "var(--status-error)",
    } : null,
    critical.length ? {
      key: "critical",
      title: "Walk the critical path",
      detail: `${critical.length} critical-path task${critical.length === 1 ? "" : "s"} (${phaseBreakdown(critical)}). Start with '${taskName(nextCritical[0] || critical[0])}' and verify its predecessor chain — a slip here directly pushes the project completion date.`,
      filter: "critical",
      tone: "var(--status-warning)",
    } : null,
    stalled.length ? {
      key: "stalled",
      title: "Resolve stalled starts",
      detail: `${stalled.length} task${stalled.length === 1 ? "" : "s"} with past start dates and 0% progress (${phaseBreakdown(stalled)}). Check '${taskName(stalled[0])}' first — is work blocked by a submittal, material, or crew issue, or does the status just need updating?`,
      filter: "stalled",
      tone: "var(--status-warning)",
    } : null,
    handoffCount ? {
      key: "lookahead",
      title: "Review the 14-day handoff",
      detail: `${handoffCount} task${handoffCount === 1 ? "" : "s"} in the two-week lookahead window. ${startsSoonEntries.length ? `${startsSoonEntries.length} starting` : ""}${startsSoonEntries.length && dueSoonEntries.length ? ", " : ""}${dueSoonEntries.length ? `${dueSoonEntries.length} finishing` : ""}${activeNowEntries.length ? `, ${activeNowEntries.length} active now` : ""}. Confirm crews, material releases, and blockers before the weekly coordination meeting.`,
      filter: "lookahead",
      tone: "var(--status-info)",
    } : null,
    shiftedAll.length ? {
      key: "shifted",
      title: "Review cascade variance",
      detail: `${shiftedAll.length} task${shiftedAll.length === 1 ? "" : "s"} drifted from stored dates by predecessor cascade (${totalShiftDays} total shift-days). Worst: '${taskName(shiftedTasks[0])}' shifted +${shiftedByDays(effectiveDates[shiftedTasks[0]?.id])}d. Decide whether to re-baseline stored dates or fix the dependency logic.`,
      filter: "shifted",
      tone: "var(--status-warning)",
    } : null,
    unassignedAll.length ? {
      key: "unassigned",
      title: "Assign owners to open work",
      detail: `${unassignedAll.length} open task${unassignedAll.length === 1 ? "" : "s"} have no owner (${phaseBreakdown(unassignedAll)}). Unowned tasks drift silently — assign a detailer, fab lead, or field foreman before relying on the lookahead.`,
      filter: "unassigned",
      tone: "var(--status-error)",
    } : null,
    logicGaps.length ? {
      key: "logic",
      title: "Tighten schedule logic",
      detail: `${logicGaps.length} task${logicGaps.length === 1 ? "" : "s"} missing predecessor or successor links (${phaseBreakdown(logicGaps)}). Add links where work gates on drawing approval, steel release, fab completion, or delivery receipt.`,
      filter: "logic",
      tone: "var(--status-warning)",
    } : null,
    tbd.length ? {
      key: "tbd",
      title: "Convert TBD dates",
      detail: `${tbd.length} task${tbd.length === 1 ? "" : "s"} still need dates (${Math.round(tbd.length / Math.max(openTasks.length, 1) * 100)}% of open work). Focus on tasks gating ${phaseBreakdown(tbd)} — downstream teams cannot plan without upstream commitments.`,
      filter: "tbd",
      tone: "var(--status-info)",
    } : null,
    unlinked.length ? {
      key: "unlinked",
      title: "Add missing logic links",
      detail: `${unlinked.length} root-level task${unlinked.length === 1 ? "" : "s"} with no predecessor/successor logic. Add links where work depends on detailing approvals, steel release packages, fab/delivery gates, or erection sequences.`,
      filter: "unlinked",
      tone: "var(--text-secondary)",
    } : null,
  ].filter(Boolean).slice(0, 4);

  // Risk score normalized by project size — a 200-task project with 3 delayed
  // items should not score as high as a 15-task project with 3 delayed items.
  const taskCount = Math.max(openTasks.length, 1);
  const rawScore =
    delayed.length * 16
    + overdue.length * 12
    + critical.length * 7
    + stalled.length * 6
    + tbd.length * 5
    + Math.min(20, shiftedTasks.length * 4)
    + Math.min(18, unassignedAll.length * 3)
    + Math.min(18, logicGaps.length * 3)
    + Math.min(20, unlinked.length * 2);
  // For small schedules (≤20 tasks) use the raw score directly.
  // For larger ones, dampen: a 100-task project needs proportionally more
  // issues to hit the same score as a 20-task one.
  const sizeNorm = taskCount <= 20 ? 1 : 20 / Math.sqrt(20 * taskCount);
  const riskScore = Math.min(100, Math.round(rawScore * sizeNorm));

  const morningPlan = [
    recoveryActions[0] ? `1. ${recoveryActions[0].title}: ${recoveryActions[0].detail}` : null,
    nextCritical[0] ? `2. Critical path check: confirm status of '${taskName(nextCritical[0])}' (${phaseOf(nextCritical[0])} / ${nextCritical[0]?.status || "No status"}) — this is the nearest critical-path gate.` : null,
    startsSoon[0] ? `3. Start handoff: verify '${taskName(startsSoon[0])}' (${phaseOf(startsSoon[0])}) is ready to begin — check ${phaseOf(startsSoon[0]) === "Detailing" ? "modeling capacity and approved-for-detailing docs" : phaseOf(startsSoon[0]) === "Fabrication" ? "material procurement and shop drawing approvals" : phaseOf(startsSoon[0]) === "Delivery" ? "PO status and trucking schedule" : phaseOf(startsSoon[0]) === "Erection" ? "crew and crane availability" : "resources and predecessor status"}.` : null,
    dueSoon[0] ? `4. Finish handoff: confirm closeout path for '${taskName(dueSoon[0])}' (${phaseOf(dueSoon[0])}) — due ${formatDateShort(dueSoon[0].end_date)}.` : null,
    shiftedTasks.length ? `5. Variance review: ${shiftedTasks.length} task${shiftedTasks.length === 1 ? "" : "s"} shifted by predecessor cascade (${totalShiftDays} total days). Worst: '${taskName(shiftedTasks[0])}' +${shiftedByDays(effectiveDates[shiftedTasks[0]?.id])}d.` : null,
    unassignedAll.length ? `6. Ownership cleanup: assign owners to ${unassignedAll.length} open task${unassignedAll.length === 1 ? "" : "s"} — unowned work drifts silently.` : null,
    logicGaps.length ? `7. Logic cleanup: ${logicGaps.length} task${logicGaps.length === 1 ? "" : "s"} missing predecessor or successor links. Add logic where work gates on approvals, releases, or deliveries.` : null,
  ].filter(Boolean);

  const aiNarrative = buildScheduleAiNarrative({
    riskScore,
    openTasks,
    delayed,
    tbd,
    overdue,
    critical,
    stalled,
    shiftedTasks,
    effectiveDates,
    logicGaps,
    unassignedTasks,
  });

  const clipboardText = [
    `Rivet Schedule Brief - ${formatLocalDate()}`,
    `Project: ${tasks[0]?.project_name || "Selected Project"}`,
    `Pressure: ${riskScore}%`,
    `Risk: ${aiNarrative.riskLevel}`,
    `Forecast Pressure: +${aiNarrative.forecastDelayDays}d`,
    aiNarrative.summary,
    `Open: ${openTasks.length}`,
    `Delayed: ${delayed.length}`,
    `Overdue: ${overdue.length}`,
    `Critical: ${critical.length}`,
    `TBD Dates: ${tbd.length}`,
    `14-Day Handoff: ${handoffCount}`,
    `Cascade Variance: ${shiftedTasks.length} tasks / ${totalShiftDays} total days`,
    `Unassigned Open Work: ${unassignedTasks.length}`,
    `Logic Gaps: ${logicGaps.length}`,
    "",
    "Recommended morning plan:",
    ...(morningPlan.length ? morningPlan : ["No recovery action is currently recommended."]),
    "",
    "14-day handoff - starting:",
    ...(startsSoon.length ? startsSoon.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks start in the next 14 days."]),
    "",
    "14-day handoff - due:",
    ...(dueSoon.length ? dueSoon.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks finish in the next 14 days."]),
    "",
    "14-day handoff - active now:",
    ...(activeNow.length ? activeNow.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open tasks are currently spanning today."]),
    "",
    "Dependency logic gaps:",
    ...(logicGaps.length ? logicGaps.map((task, index) => `${index + 1}. ${formatBriefTask(task)} - pred ${dependencyCount(task)}, succ ${successorCountById[String(task.id)] || 0}`) : ["No open dependency logic gaps found."]),
    "",
    "Cascade variance:",
    ...(shiftedTasks.length ? shiftedTasks.map((task, index) => {
      const effective = effectiveDates[task.id];
      return `${index + 1}. ${formatBriefTask(task)} - stored ${formatDateShort(task.start_date)} to ${formatDateShort(task.end_date)}, effective ${formatDateShort(effective.start)} to ${formatDateShort(effective.end)}, +${shiftedByDays(effective)}d`;
    }) : ["No dependency cascade variance found."]),
    "",
    "Unassigned open work:",
    ...(unassignedTasks.length ? unassignedTasks.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No unassigned open work found."]),
    "",
    "Upcoming critical path watch:",
    ...(nextCritical.length ? nextCritical.map((task, index) => `${index + 1}. ${formatBriefTask(task)}`) : ["No open critical path tasks are marked."]),
  ].join("\n");

  return { openTasks, delayed, tbd, overdue, critical, stalled, nearTerm, startsSoon, dueSoon, activeNow, handoffCount, unassignedTasks, shiftedTasks, effectiveDates, totalShiftDays, logicGaps, successorCountById, unlinked, nextCritical, phaseRows, recoveryActions, morningPlan, clipboardText, riskScore, aiNarrative };
}

export default function ScheduleRivetBrief({ tasks = [], project, phaseFilter, onSetPhaseFilter, onSetView, onSetGanttFocus }) {
  const [copyState, setCopyState] = useState("idle");
  const brief = useMemo(() => buildBrief(tasks), [tasks]);
  const primaryPhase = brief.phaseRows[0]?.phase || null;
  const healthTone = brief.riskScore >= 70 ? "var(--status-error)" : brief.riskScore >= 35 ? "var(--status-warning)" : "var(--status-success)";

  // Collapsible state — default COLLAPSED (data-first for enterprise schedulers)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(RIVET_COLLAPSED_KEY);
      // Default to collapsed if no stored preference
      return stored === null ? true : stored === "true";
    } catch { return true; }
  });
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  // Measure content height for smooth CSS transition
  useEffect(() => {
    if (contentRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContentHeight(entry.contentRect.height);
        }
      });
      observer.observe(contentRef.current);
      // Initial measurement
      setContentHeight(contentRef.current.scrollHeight);
      return () => observer.disconnect();
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(RIVET_COLLAPSED_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Data-driven recommendation — references actual task names, phases, and counts
  const recommendation = (() => {
    const topPhase = brief.phaseRows[0]?.phase;
    const topPhaseSuffix = topPhase ? ` — most pressure is in ${topPhase}.` : ".";

    if (brief.delayed.length) {
      const first = taskName(brief.delayed[0]);
      const phaseMix = [...new Set(brief.delayed.map(t => phaseOf(t)))].join(", ");
      return `${brief.delayed.length} task${brief.delayed.length === 1 ? " is" : "s are"} flagged delayed across ${phaseMix}. Start with '${first}', check its predecessor chain, and verify downstream release or delivery dates are still achievable${topPhaseSuffix}`;
    }
    if (brief.overdue.length) {
      const first = taskName(brief.overdue[0]);
      const worstLag = brief.overdue.reduce((max, t) => {
        const lag = daysFromToday(t.end_date);
        return lag != null && lag < 0 ? Math.max(max, Math.abs(lag)) : max;
      }, 0);
      return `${brief.overdue.length} task${brief.overdue.length === 1 ? " is" : "s are"} past due (worst: ${worstLag}d). Start with '${first}' — confirm whether the work is actually done and status needs updating, or if the finish date needs to be pushed and downstream teams notified${topPhaseSuffix}`;
    }
    if (brief.stalled.length) {
      const first = taskName(brief.stalled[0]);
      return `${brief.stalled.length} task${brief.stalled.length === 1 ? " has" : "s have"} a past start date but 0% progress. Check '${first}' first — is the work blocked, waiting on a predecessor, or was it actually started but not updated?${topPhaseSuffix}`;
    }
    if (brief.tbd.length) {
      const tbdPct = brief.openTasks.length ? Math.round((brief.tbd.length / brief.openTasks.length) * 100) : 0;
      return `${brief.tbd.length} open task${brief.tbd.length === 1 ? "" : "s"} (${tbdPct}% of open work) still need dates. Focus on tasks that gate detailing approvals, fabrication starts, or delivery releases — those downstream dependencies can't plan without upstream dates${topPhaseSuffix}`;
    }
    if (brief.shiftedTasks.length) {
      const maxShift = brief.shiftedTasks.reduce((max, t) => Math.max(max, shiftedByDays(brief.effectiveDates[t.id])), 0);
      return `No delayed or overdue work, but ${brief.shiftedTasks.length} task${brief.shiftedTasks.length === 1 ? " has" : "s have"} drifted up to ${maxShift}d from stored dates due to predecessor cascade. Review whether stored dates should be re-baselined or if dependency logic needs correction.`;
    }
    if (brief.logicGaps.length) {
      return `Schedule dates look clean. ${brief.logicGaps.length} task${brief.logicGaps.length === 1 ? "" : "s"} still lack predecessor or successor links — tighten logic before the next coordination meeting so critical-path movement is visible.`;
    }
    return `No major recovery pattern is visible across ${brief.openTasks.length} open tasks. Use the 14-day handoff panel to keep the next six weeks clean and confirm owner accountability.`;
  })();

  const copyMorningBrief = async () => {
    const text = brief.clipboardText.replace("Project: Selected Project", `Project: ${project?.name || "Selected Project"}`);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("failed");
      setTimeout(() => setCopyState("idle"), 1600);
    }
  };

  const focusFilter = (filter) => {
    onSetGanttFocus?.({ filter });
  };

  const focusTask = (task, filter) => {
    onSetGanttFocus?.({
      filter,
      taskId: task?.id,
      taskName: taskName(task),
    });
  };

  return (
    <section style={shellStyle}>
      <div style={headerStyle}>
        <div style={titleWrapStyle}>
          <span style={avatarStyle}><Sparkles size={15} /></span>
          <div>
            <div style={eyebrowStyle}>Rivet Schedule Brief</div>
            <div style={titleStyle}>{project?.name || "Selected Project"}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={riskPillStyle(healthTone)}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: healthTone, boxShadow: `0 0 12px ${healthTone}` }} />
            {brief.riskScore}% pressure
          </div>
          {collapsed && (
            <span style={collapsedMetricsStyle}>
              <span style={{ color: brief.delayed.length ? "var(--status-error)" : "var(--text-muted)" }}>{brief.delayed.length} delayed</span>
              <span style={{ color: brief.overdue.length ? "var(--status-warning)" : "var(--text-muted)" }}>{brief.overdue.length} overdue</span>
              <span style={{ color: brief.critical.length ? "var(--status-warning)" : "var(--text-muted)" }}>{brief.critical.length} critical</span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            style={toggleButtonStyle}
            title={collapsed ? "Expand Rivet brief" : "Collapse Rivet brief"}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand schedule brief" : "Collapse schedule brief"}
          >
            <ChevronDown
              size={14}
              style={{
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform 0.25s ease",
              }}
            />
          </button>
        </div>
      </div>

      <div
        style={{
          maxHeight: collapsed ? 0 : (contentHeight || 4000),
          overflow: "hidden",
          transition: "max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          opacity: collapsed ? 0 : 1,
          transitionProperty: "max-height, opacity",
          transitionDuration: "0.35s, 0.25s",
          transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1), ease",
        }}
      >
      <div ref={contentRef} style={{ ...gridStyle, paddingTop: 12 }}>
        <ScheduleAiRiskCard insight={brief.aiNarrative} />

        <Metric icon={AlertTriangle} label="Delayed" value={brief.delayed.length} tone={brief.delayed.length ? "var(--status-error)" : "var(--status-success)"} />
        <Metric icon={CalendarClock} label="Overdue" value={brief.overdue.length} tone={brief.overdue.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Target} label="TBD Dates" value={brief.tbd.length} tone={brief.tbd.length ? "var(--status-info)" : "var(--status-success)"} />
        <Metric icon={GitBranch} label="Logic Gaps" value={brief.logicGaps.length} tone={brief.logicGaps.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={ShieldAlert} label="Critical" value={brief.critical.length} tone={brief.critical.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Route} label="14-Day" value={brief.handoffCount} tone={brief.handoffCount ? "var(--status-info)" : "var(--status-success)"} />
        <Metric icon={TrendingUp} label="Variance" value={brief.shiftedTasks.length} tone={brief.shiftedTasks.length ? "var(--status-warning)" : "var(--status-success)"} />
        <Metric icon={Users} label="No Owner" value={brief.unassignedTasks.length} tone={brief.unassignedTasks.length ? "var(--status-error)" : "var(--status-success)"} />
        <Metric icon={Zap} label="Stalled" value={brief.stalled.length} tone={brief.stalled.length ? "var(--status-error)" : "var(--status-success)"} />

        <div style={recommendationStyle}>
          <div style={miniLabelStyle}>Rivet read</div>
          <p style={copyStyle}>{recommendation}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {brief.overdue.length > 0 && (
              <Button size="sm" variant="secondary" icon="alert" onClick={() => focusFilter("overdue")}>
                Show Overdue
              </Button>
            )}
            {brief.critical.length > 0 && (
              <Button size="sm" variant="secondary" icon="arrow" onClick={() => focusFilter("critical")}>
                Show Critical
              </Button>
            )}
            {brief.logicGaps.length > 0 && (
              <Button size="sm" variant="secondary" icon="link" onClick={() => focusFilter("logic")}>
                Show Logic
              </Button>
            )}
            {brief.shiftedTasks.length > 0 && (
              <Button size="sm" variant="secondary" icon="alert" onClick={() => focusFilter("shifted")}>
                Show Variance
              </Button>
            )}
            {brief.unassignedTasks.length > 0 && (
              <Button size="sm" variant="secondary" icon="filter" onClick={() => focusFilter("unassigned")}>
                Show No Owner
              </Button>
            )}
            {primaryPhase && (
              <Button
                size="sm"
                variant={phaseFilter === primaryPhase ? "primary" : "secondary"}
                icon="filter"
                onClick={() => onSetPhaseFilter?.(primaryPhase)}
              >
                Focus {primaryPhase}
              </Button>
            )}
            <Button size="sm" variant="secondary" icon="calendar" onClick={() => onSetView?.("lookahead")}>
              6-Week Lookahead
            </Button>
            <Button size="sm" variant="secondary" icon="filter" onClick={() => focusFilter("lookahead")}>
              Show 14-Day
            </Button>
            <Button size="sm" variant="outline" icon="arrow-up-right" onClick={() => onSetView?.("gantt")}>
              Gantt
            </Button>
            <Button size="sm" variant="outline" icon="download" onClick={copyMorningBrief}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy Failed" : "Copy Brief"}
            </Button>
          </div>
        </div>

        <div style={phasePanelStyle}>
          <div style={miniLabelStyle}>Phase pressure</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.phaseRows.length ? brief.phaseRows.map((row) => (
              <button
                key={row.phase}
                type="button"
                onClick={() => onSetPhaseFilter?.(row.phase)}
                style={phaseRowStyle(phaseFilter === row.phase)}
              >
                <span style={{ color: "var(--text-primary)", fontWeight: 900 }}>{row.phase}</span>
                <span>{row.open} open</span>
                <span style={{ color: row.critical ? "var(--status-warning)" : "var(--text-muted)" }}>{row.critical} critical</span>
                <span style={{ color: row.delayed ? "var(--status-error)" : "var(--text-muted)" }}>{row.delayed} delayed</span>
                <span style={{ color: row.tbd ? "var(--status-info)" : "var(--text-muted)" }}>{row.tbd} TBD</span>
              </button>
            )) : (
              <div style={emptyStyle}>No open phase pressure.</div>
            )}
          </div>
        </div>

        <div style={morningPlanStyle}>
          <div style={miniLabelStyle}>Morning planning brief</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.morningPlan.length ? brief.morningPlan.map((line, index) => (
              <div key={line} style={morningPlanRowStyle}>
                <span className="sbd-num" style={{ color: index === 0 ? "var(--status-warning)" : "var(--accent)", fontSize: 11, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</span>
                <span>{line.replace(/^\d+\.\s*/, "")}</span>
              </div>
            )) : (
              <div style={emptyStyle}>No recovery action is currently recommended.</div>
            )}
          </div>
        </div>

        <div style={handoffPanelStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div style={miniLabelStyle}>14-day handoff</div>
            <button type="button" onClick={() => focusFilter("lookahead")} style={linkButtonStyle}>
              Open in Gantt
            </button>
          </div>
          <div style={handoffGridStyle}>
            <div>
              <div style={handoffHeadingStyle}>Active now</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.activeNow.length ? brief.activeNow.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "lookahead")} style={handoffTaskStyle}>
                    <span style={dateChipStyle}>{task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={taskNameStyle}>{taskName(task)}</span>
                      <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"}</span>
                    </span>
                  </button>
                )) : (
                  <div style={emptyStyle}>No open tasks currently span today.</div>
                )}
              </div>
            </div>
            <div>
              <div style={handoffHeadingStyle}>Starting</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.startsSoon.length ? brief.startsSoon.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "lookahead")} style={handoffTaskStyle}>
                    <span style={dateChipStyle}>{task.start_date ? formatDateShort(task.start_date) : "TBD"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={taskNameStyle}>{taskName(task)}</span>
                      <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"}</span>
                    </span>
                  </button>
                )) : (
                  <div style={emptyStyle}>No open tasks start in the next 14 days.</div>
                )}
              </div>
            </div>
            <div>
              <div style={handoffHeadingStyle}>Due</div>
              <div style={{ display: "grid", gap: 7, marginTop: 8 }}>
                {brief.dueSoon.length ? brief.dueSoon.map((task) => (
                  <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "lookahead")} style={handoffTaskStyle}>
                    <span style={dateChipStyle}>{task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={taskNameStyle}>{taskName(task)}</span>
                      <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"}</span>
                    </span>
                  </button>
                )) : (
                  <div style={emptyStyle}>No open tasks finish in the next 14 days.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={recoveryPanelStyle}>
          <div style={miniLabelStyle}>Rivet recovery queue</div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {brief.recoveryActions.length ? brief.recoveryActions.map((action, index) => (
              <button
                key={action.key}
                type="button"
                onClick={() => focusFilter(action.filter)}
                style={recoveryRowStyle(action.tone)}
              >
                <span className="sbd-num" style={{ color: action.tone, fontSize: 12, fontWeight: 900 }}>{String(index + 1).padStart(2, "0")}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: "var(--text-primary)", fontWeight: 900 }}>{action.title}</span>
                  <span style={{ display: "block", marginTop: 3, color: "var(--text-secondary)", lineHeight: 1.35, textTransform: "none", letterSpacing: 0 }}>{action.detail}</span>
                </span>
                <span style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>Open</span>
              </button>
            )) : (
              <div style={emptyStyle}>No recovery action is currently recommended.</div>
            )}
          </div>
        </div>

        <div style={variancePanelStyle}>
          <div style={miniLabelStyle}>Cascade variance review</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.shiftedTasks.length ? brief.shiftedTasks.slice(0, 5).map((task) => {
              const effective = brief.effectiveDates[task.id];
              return (
                <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "shifted")} style={varianceTaskStyle}>
                  <span style={varianceDaysStyle}>+{shiftedByDays(effective)}d</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={taskNameStyle}>{taskName(task)}</span>
                    <span style={taskMetaStyle}>
                      Stored {task.start_date ? formatDateShort(task.start_date) : "TBD"} to {task.end_date ? formatDateShort(task.end_date) : "TBD"} / effective {effective?.start ? formatDateShort(effective.start) : "TBD"} to {effective?.end ? formatDateShort(effective.end) : "TBD"}
                    </span>
                  </span>
                </button>
              );
            }) : (
              <div style={emptyStyle}>No dependency cascade variance found.</div>
            )}
          </div>
        </div>

        <div style={ownershipPanelStyle}>
          <div style={miniLabelStyle}>Ownership watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.unassignedTasks.length ? brief.unassignedTasks.slice(0, 5).map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "unassigned")} style={ownershipTaskStyle}>
                <Users size={12} color="var(--status-error)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {taskDate(task) ? formatDateShort(taskDate(task)) : "TBD"}</span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No unassigned open work found.</div>
            )}
          </div>
        </div>

        <div style={criticalPanelStyle}>
          <div style={miniLabelStyle}>Critical path watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.nextCritical.length ? brief.nextCritical.map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "critical")} style={criticalTaskStyle}>
                <CheckCircle2 size={12} color="var(--status-warning)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {taskDate(task) ? formatDateShort(taskDate(task)) : "TBD"}</span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No open critical path tasks are marked yet.</div>
            )}
          </div>
        </div>

        <div style={dependencyPanelStyle}>
          <div style={miniLabelStyle}>Dependency logic watch</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.logicGaps.length ? brief.logicGaps.slice(0, 5).map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "logic")} style={logicTaskStyle}>
                <GitBranch size={12} color="var(--status-warning)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>
                    {phaseOf(task)} / pred {dependencyCount(task)} / succ {brief.successorCountById[String(task.id)] || 0}
                  </span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No open dependency logic gaps found.</div>
            )}
          </div>
        </div>

        <div style={nearTermStyle}>
          <div style={miniLabelStyle}>Next visible tasks</div>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {brief.nearTerm.length ? brief.nearTerm.map((task) => (
              <button key={task.id || taskName(task)} type="button" onClick={() => focusTask(task, "all")} style={taskRowStyle}>
                <Route size={12} color="var(--status-info)" />
                <span style={{ minWidth: 0 }}>
                  <span style={taskNameStyle}>{taskName(task)}</span>
                  <span style={taskMetaStyle}>{phaseOf(task)} / {task.status || "No status"} / {task.end_date ? formatDateShort(task.end_date) : "TBD"}</span>
                </span>
              </button>
            )) : (
              <div style={emptyStyle}>No tasks dated in the next six weeks.</div>
            )}
          </div>
        </div>
      </div>
      </div>
    </section>
  );
}

function riskTone(level) {
  if (level === "HIGH") return "var(--status-error)";
  if (level === "MEDIUM") return "var(--status-warning)";
  return "var(--status-success)";
}

function ScheduleAiRiskCard({ insight }) {
  if (!insight) return null;

  const tone = riskTone(insight.riskLevel);

  function aiRiskPanelStyle(tone) {
    return {
      gridColumn: "span 6",
      border: `1px solid color-mix(in srgb, ${tone} 34%, var(--border-default))`,
      borderRadius: 16,
      background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 10%, rgba(255,255,255,0.035)), rgba(255,255,255,0.025))`,
      boxShadow: `inset 3px 0 0 ${tone}, 0 16px 34px rgba(0,0,0,0.18)`,
      padding: 14,
    };
  }

  const aiRiskHeaderStyle = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 10,
  };

  const aiRiskEyebrowStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "var(--status-info)",
  };

  const aiRiskTitleStyle = {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-primary)",
  };

  function aiRiskDelayStyle(tone) {
    return {
      display: "inline-flex",
      alignItems: "center",
      minHeight: 22,
      padding: "0 8px",
      borderRadius: 999,
      border: `1px solid color-mix(in srgb, ${tone} 42%, transparent)`,
      background: `color-mix(in srgb, ${tone} 12%, transparent)`,
      color: tone,
      whiteSpace: "nowrap",
    };
  }

  function aiRiskScoreStyle(tone) {
    return {
      width: 48,
      height: 48,
      borderRadius: 14,
      display: "grid",
      placeItems: "center",
      border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
      background: `color-mix(in srgb, ${tone} 12%, var(--bg-surface-high))`,
      color: tone,
      fontFamily: "var(--font-mono)",
      fontSize: 13,
      fontWeight: 900,
      flexShrink: 0,
    };
  }

  const aiRiskSummaryStyle = {
    margin: "0 0 12px",
    color: "var(--text-secondary)",
    fontFamily: "var(--font-body)",
    fontSize: 13,
    lineHeight: 1.48,
  };

  const aiRiskColumnsStyle = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr)",
    gap: 10,
    alignItems: "stretch",
  };

  const aiRiskSectionStyle = {
    border: "1px solid var(--border-default)",
    borderRadius: 12,
    background: "rgba(255,255,255,0.025)",
    padding: 11,
    minWidth: 0,
  };

  const aiRiskSectionTitleStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  };

  const aiRiskTaskStyle = {
    borderTop: "1px solid var(--border-default)",
    paddingTop: 8,
  };

  const aiRiskTextStyle = {
    marginTop: 5,
    fontFamily: "var(--font-body)",
    fontSize: 12,
    lineHeight: 1.38,
    color: "var(--text-secondary)",
  };

  const aiRiskListStyle = {
    margin: 0,
    paddingLeft: 17,
    display: "grid",
    gap: 7,
  };

  const aiRiskListItemStyle = {
    fontFamily: "var(--font-body)",
    fontSize: 12,
    lineHeight: 1.38,
    color: "var(--text-secondary)",
  };

  const aiRiskFooterStyle = {
    marginTop: 10,
    paddingTop: 9,
    borderTop: "1px solid var(--border-default)",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  };

  return (
    <div style={aiRiskPanelStyle(tone)}>
      <div style={aiRiskHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={aiRiskEyebrowStyle}>Schedule AI - Planning Engine</div>
          <div style={aiRiskTitleStyle}>
            <span>RISK: {insight.riskLevel}</span>
            <span style={aiRiskDelayStyle(tone)}>+{insight.forecastDelayDays}d forecast pressure</span>
          </div>
        </div>
        <div style={aiRiskScoreStyle(tone)}>{insight.riskScore}%</div>
      </div>

      <p style={aiRiskSummaryStyle}>{insight.summary}</p>

      <div style={aiRiskColumnsStyle}>
        <div style={aiRiskSectionStyle}>
          <div style={aiRiskSectionTitleStyle}>At-Risk Tasks ({insight.atRisk.length})</div>
          <div style={{ display: "grid", gap: 9 }}>
            {insight.atRisk.length ? insight.atRisk.map((entry) => (
              <div key={entry.task?.id || entry.label} style={aiRiskTaskStyle}>
                <div style={taskNameStyle}>{entry.label}</div>
                <div style={aiRiskTextStyle}><strong>Why:</strong> {entry.why}</div>
                <div style={aiRiskTextStyle}><strong>Fix:</strong> {entry.fix}</div>
              </div>
            )) : (
              <div style={emptyStyle}>No dated critical task risk is currently visible.</div>
            )}
          </div>
        </div>

        <div style={aiRiskSectionStyle}>
          <div style={aiRiskSectionTitleStyle}>Blockers</div>
          <ul style={aiRiskListStyle}>
            {(insight.blockers.length ? insight.blockers : ["No explicit blocker is visible from current schedule data."]).map((item) => (
              <li key={item} style={aiRiskListItemStyle}>{item}</li>
            ))}
          </ul>
        </div>

        <div style={aiRiskSectionStyle}>
          <div style={aiRiskSectionTitleStyle}>Sequence Suggestions</div>
          <ol style={aiRiskListStyle}>
            {(insight.sequenceSuggestions.length ? insight.sequenceSuggestions : ["Keep monitoring the 14-day handoff and update dates as work firms up."]).map((item) => (
              <li key={item} style={aiRiskListItemStyle}>{item}</li>
            ))}
          </ol>
        </div>
      </div>

      <div style={aiRiskFooterStyle}>
        Model: {insight.modelLabel} - Analyzed: {insight.analyzedAt}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div style={metricStyle(tone)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={miniLabelStyle}>{label}</span>
        <Icon size={14} color={tone} />
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 900, color: tone, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const shellStyle = {
  flexShrink: 0,
  margin: "0 24px 12px",
  border: "1px solid color-mix(in srgb, var(--border-default) 84%, white 16%)",
  borderRadius: 18,
  background: "var(--sched-band-bg)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.055), 0 18px 42px rgba(0,0,0,0.28)",
  padding: 14,
};

const toggleButtonStyle = {
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid var(--border-default)",
  background: "rgba(255,255,255,0.04)",
  color: "var(--text-muted)",
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s, color 0.15s",
  flexShrink: 0,
};

const collapsedMetricsStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 12,
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  marginBottom: 0,
};

const titleWrapStyle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const avatarStyle = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  color: "#04111d",
  background: "linear-gradient(135deg, var(--status-info), color-mix(in srgb, var(--status-info) 70%, white 30%))",
  boxShadow: "0 0 18px color-mix(in srgb, var(--status-info) 40%, transparent)",
  flexShrink: 0,
};

const eyebrowStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: 18,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

function riskPillStyle(tone) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    height: 30,
    padding: "0 11px",
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${tone} 45%, transparent)`,
    background: `color-mix(in srgb, ${tone} 12%, var(--bg-surface-high))`,
    color: tone,
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 900,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
}

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(104px, 1fr))",
  gap: 10,
  alignItems: "stretch",
};

function metricStyle(tone) {
  return {
    minHeight: 104,
    border: `1px solid color-mix(in srgb, ${tone} 28%, var(--border-default))`,
    borderRadius: 14,
    background: `linear-gradient(145deg, color-mix(in srgb, ${tone} 10%, rgba(255,255,255,0.035)), rgba(255,255,255,0.025))`,
    padding: 12,
    display: "grid",
    alignContent: "space-between",
  };
}

const recommendationStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

const phasePanelStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  padding: 12,
};

const nearTermStyle = {
  gridColumn: "span 3",
  border: "1px solid var(--border-default)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.025)",
  padding: 12,
};

const recoveryPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-info) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(34,211,238,0.055), rgba(255,255,255,0.025))",
  padding: 12,
};

const morningPlanStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--accent) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(86,176,255,0.06), rgba(255,255,255,0.025))",
  padding: 12,
};

const handoffPanelStyle = {
  gridColumn: "span 6",
  border: "1px solid color-mix(in srgb, var(--status-info) 30%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(135deg, rgba(34,211,238,0.07), rgba(255,255,255,0.026))",
  padding: 12,
};

const handoffGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  marginTop: 10,
};

const handoffHeadingStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  fontWeight: 900,
  letterSpacing: "0.11em",
  textTransform: "uppercase",
  color: "var(--status-info)",
};

const linkButtonStyle = {
  border: "1px solid var(--accent-border)",
  borderRadius: 999,
  background: "var(--accent-muted)",
  color: "var(--accent)",
  padding: "5px 9px",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const criticalPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.055), rgba(255,255,255,0.025))",
  padding: 12,
};

const dependencyPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.05), rgba(255,255,255,0.025))",
  padding: 12,
};

const variancePanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-warning) 28%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(245,158,11,0.06), rgba(255,255,255,0.025))",
  padding: 12,
};

const ownershipPanelStyle = {
  gridColumn: "span 3",
  border: "1px solid color-mix(in srgb, var(--status-error) 26%, var(--border-default))",
  borderRadius: 14,
  background: "linear-gradient(145deg, rgba(239,68,68,0.052), rgba(255,255,255,0.025))",
  padding: 12,
};

const miniLabelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const copyStyle = {
  margin: "7px 0 0",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.45,
  color: "var(--text-secondary)",
};

function phaseRowStyle(active) {
  return {
    width: "100%",
    border: `1px solid ${active ? "var(--accent-border)" : "var(--border-default)"}`,
    borderRadius: 10,
    background: active ? "var(--accent-muted)" : "rgba(255,255,255,0.025)",
    color: "var(--text-muted)",
    padding: "8px 9px",
    display: "grid",
    gridTemplateColumns: "minmax(90px, 1fr) auto auto auto auto",
    gap: 8,
    alignItems: "center",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

function recoveryRowStyle(tone) {
  return {
    width: "100%",
    border: `1px solid color-mix(in srgb, ${tone} 26%, var(--border-default))`,
    borderRadius: 12,
    background: `linear-gradient(135deg, color-mix(in srgb, ${tone} 8%, transparent), rgba(255,255,255,0.025))`,
    color: "var(--text-muted)",
    padding: "9px 10px",
    display: "grid",
    gridTemplateColumns: "24px minmax(0, 1fr) auto",
    gap: 9,
    alignItems: "start",
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: 8,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };
}

const morningPlanRowStyle = {
  display: "grid",
  gridTemplateColumns: "24px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 11,
  background: "rgba(255,255,255,0.025)",
  color: "var(--text-secondary)",
  padding: "8px 10px",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  lineHeight: 1.35,
};

const criticalTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.025)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const logicTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(245,158,11,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const varianceTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "42px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(245,158,11,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const ownershipTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  border: "1px solid color-mix(in srgb, var(--status-error) 24%, var(--border-default))",
  borderRadius: 10,
  background: "rgba(239,68,68,0.045)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const varianceDaysStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 22,
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--status-warning) 38%, var(--border-default))",
  background: "rgba(245,158,11,0.10)",
  color: "var(--status-warning)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const handoffTaskStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "58px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
  border: "1px solid var(--border-default)",
  borderRadius: 10,
  background: "rgba(255,255,255,0.026)",
  padding: "8px 9px",
  textAlign: "left",
  cursor: "pointer",
};

const dateChipStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 22,
  borderRadius: 8,
  border: "1px solid color-mix(in srgb, var(--status-info) 32%, var(--border-default))",
  background: "rgba(34,211,238,0.08)",
  color: "var(--status-info)",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  fontWeight: 900,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const taskRowStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 8,
  alignItems: "start",
  background: "transparent",
  color: "inherit",
  textAlign: "left",
  borderTop: "1px solid var(--border-default)",
  borderRight: "none",
  borderBottom: "none",
  borderLeft: "none",
  paddingTop: 7,
  cursor: "pointer",
};

const taskNameStyle = {
  display: "block",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  fontWeight: 900,
  color: "var(--text-primary)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const taskMetaStyle = {
  display: "block",
  fontFamily: "var(--font-mono)",
  fontSize: 8,
  color: "var(--text-muted)",
  marginTop: 2,
};

const emptyStyle = {
  fontFamily: "var(--font-body)",
  fontSize: 12,
  color: "var(--text-muted)",
};
